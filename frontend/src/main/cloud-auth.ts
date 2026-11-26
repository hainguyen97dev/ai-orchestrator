import { app, dialog, ipcMain, safeStorage } from "electron";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { CloudAccount } from "../shared/cloud-account";
import { ldapSignInConfig } from "../shared/ldap-sign-in";
// Static import (not dynamic): the dynamic import created a static+dynamic
// import cycle with cloud-auth-local that made the bundler split chunks
// incorrectly and panic. Both modules only use each other's exports inside
// functions, so the static ES cycle is safe at module-init time.
import { revokeLocalSession } from "./cloud-auth-local";
import { providerAuthFlow } from "./provider-auth-flow";

// persistLocalClaudeOAuthToken writes a captured Claude setup-token under the AO
// data dir so local claude sessions can authenticate with the SAME credential
// pushed to the cloud (read back by the daemon's claudecode adapter). Scoped to
// ~/.ao, never the user's ~/.claude; 0600 file in a 0700 dir. This is not the
// token chosen in AO's Claude login menu (harnesses/claude-code/setup-token):
// that one outranks a native login, this one never does.
async function persistLocalClaudeOAuthToken(dataDir: string, token: string): Promise<void> {
  const dir = path.join(dataDir, "harnesses", "claude-code");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "oauth-token");
  await writeFile(file, token, { mode: 0o600 });
  await chmod(file, 0o600);
}

const AUTH_STORE_FILE = "cloud-auth.bin";
const LEGACY_SESSION_FILE = "cloud-session.json";

// Set by installCloudIPC so store reads can push a recovered or cleared
// session to every renderer.
let notifyRenderersFn: ((session: CloudAccount | null) => void) | null = null;

let activeProviderAuthAbort: AbortController | null = null;

export interface StoredSession extends CloudAccount {
  accessToken: string;
  // Only sessions saved by the removed WorkOS sign-in carry one. Such a session
  // is no longer usable and reads as signed out.
  refreshToken?: string;
  // Loopback control-plane base URL a local session was minted against, so
  // sign-out can revoke the opaque token server-side. Local sessions only.
  cpBaseUrl?: string;
}

export interface AuthStore {
  session: StoredSession | null;
  // Left by the removed WorkOS sign-in in stores saved before it went; kept
  // so those files still parse. Nothing sets them any more.
  completedCallback?: string;
  pkce: {
    codeVerifier: string;
    state: string;
    expiresAt: number;
  } | null;
}

/** A stored local (opaque-token) session, the only kind this build signs in with. */
export function isLocalSession(
  session: StoredSession | null | undefined,
): session is StoredSession & { authProvider: "local" } {
  return session?.authProvider === "local";
}

const emptyStore = (): AuthStore => ({ session: null, pkce: null });

// A store written while protected storage was unavailable, kept in this process
// until it can be saved. One holding a credential (a sign-in or a rotated token)
// replaces the file, which was deleted then. One without only adds a pending
// sign-in on top of the file, which stays for when storage is back.
interface MemoryStore {
  store: AuthStore;
  replacesFile: boolean;
}
const memoryStores = new Map<string, MemoryStore>();
// Data dirs whose file could not be read during an outage, so the signed-out
// store handed out then is not a sign-out.
const unreadFiles = new Set<string>();
// Data dirs whose file did not decrypt this run: the keychain was locked, its
// access prompt was denied, or the key is not the one the file was saved
// with. The file is kept for the next launch and not decrypted again in this
// one, so a denied prompt does not come back on every read.
const undecryptable = new Set<string>();
// The session the file held when this run last read or wrote it, so a store
// written during an outage that only carries that session on (a sign-in
// started, an expired one cleared) is not taken for a new credential.
const fileSessions = new Map<string, StoredSession | null>();

// Whether two sessions are the same credential, not just the same account.
function sameCredential(a: StoredSession | null | undefined, b: StoredSession | null | undefined): boolean {
  return !!a && !!b && a.accessToken === b.accessToken && a.refreshToken === b.refreshToken;
}
const storeOps = new Map<string, Promise<void>>();
const authGenerations = new Map<string, number>();
const authMutations = new Map<string, Promise<void>>();

// Runs one operation per data dir at a time, in call order.
async function serialize<T>(
  queue: Map<string, Promise<void>>,
  dataDir: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = queue.get(dataDir) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  queue.set(dataDir, settled);
  try {
    return await result;
  } finally {
    if (queue.get(dataDir) === settled) queue.delete(dataDir);
  }
}

function authGeneration(dataDir: string): number {
  return authGenerations.get(dataDir) ?? 0;
}

export function invalidateAuthOperations(dataDir: string): number {
  const generation = authGeneration(dataDir) + 1;
  authGenerations.set(dataDir, generation);
  return generation;
}

export function withAuthMutation<T>(
  dataDir: string,
  mutation: () => Promise<T>,
): Promise<T> {
  return serialize(authMutations, dataDir, mutation);
}

/**
 * Where the Cloud sign-in is kept. An AO_DATA_DIR override gives that data
 * dir its own sign-in, as it gives it its own daemon data, so two instances
 * with different data dirs never share an account. Otherwise ~/.ao, or
 * ~/.ao/dev for a development build.
 */
export function resolveCloudAuthDir(
  env: Record<string, string | undefined>,
  homeDir: string,
  launchWorkingDirectory: string,
  isPackaged: boolean,
): string {
  const configured = env.AO_DATA_DIR?.trim();
  if (configured) return path.resolve(launchWorkingDirectory, configured);
  return isPackaged ? path.join(homeDir, ".ao") : path.join(homeDir, ".ao", "dev");
}

function storePath(dataDir: string): string {
  return path.join(dataDir, AUTH_STORE_FILE);
}

/** Whether safeStorage protects what it encrypts (not Linux's basic_text backend). */
export function protectedStorageAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (process.platform !== "linux") return true;
  const backend = safeStorage.getSelectedStorageBackend();
  return backend !== "basic_text" && backend !== "unknown";
}

function encodeStore(store: AuthStore): Buffer {
  return safeStorage.encryptString(JSON.stringify(store));
}

/**
 * The saved login exists but could not be read just now (too many open files,
 * a busy disk, no permission). It is not a sign-out: the file is left as it
 * is, and the next read can find the login again. Carries only the error code,
 * never the path or the file's contents.
 */
export class AuthStoreUnreadableError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`The saved Orchestrator Cloud login could not be read (${code}).`);
    this.name = "AuthStoreUnreadableError";
    this.code = code;
  }
}

// Read errors that usually clear within moments, so the read tries again
// before giving up: the process is out of file handles (EMFILE, ENFILE), or
// the file is briefly locked (EAGAIN, EBUSY).
const TRANSIENT_READ_CODES = new Set(["EMFILE", "ENFILE", "EAGAIN", "EBUSY"]);
const TRANSIENT_READ_RETRY_MS = [25, 100, 250];

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code !== "" ? code : "UNKNOWN";
}

// The encrypted store file's bytes, or null when there is no file. Any other
// failure throws AuthStoreUnreadableError and leaves the file in place.
async function readStoreBytes(file: string): Promise<Buffer | null> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await readFile(file);
    } catch (error) {
      const code = errorCode(error);
      if (code === "ENOENT") return null;
      const retryMs = TRANSIENT_READ_CODES.has(code) ? TRANSIENT_READ_RETRY_MS[attempt] : undefined;
      if (retryMs === undefined) throw new AuthStoreUnreadableError(code);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
}

// The file's store, or null when the file is there but did not decrypt. No
// file is the only read that means "no saved login". A read that failed
// throws AuthStoreUnreadableError instead, so nothing downstream takes it for
// a sign-out or writes an empty store over the login.
async function readStoreFile(dataDir: string): Promise<AuthStore | null> {
  const value = await readStoreBytes(storePath(dataDir));
  if (value === null) return emptyStore();
  let text: string;
  try {
    text = safeStorage.decryptString(value);
  } catch {
    return null;
  }
  try {
    const store: unknown = JSON.parse(text);
    if (!store || typeof store !== "object") throw new Error("Not an auth store.");
    return store as AuthStore;
  } catch {
    // The file decrypts but holds no store this app can use, so no later
    // read can recover a login from it.
    await rm(storePath(dataDir), { force: true });
    return emptyStore();
  }
}

// The file did not decrypt. Keep it, and read as signed out until a restart
// tries again or a new sign-in is saved over it.
function noteUndecryptable(dataDir: string): void {
  if (!undecryptable.has(dataDir)) {
    console.warn(
      "Orchestrator Cloud sign-in could not be decrypted. It is kept, and the next launch tries again.",
    );
  }
  undecryptable.add(dataDir);
  unreadFiles.add(dataDir);
}

// Writes a temporary file and renames it over the store, so a write that fails
// partway leaves the saved sign-in as it was.
async function writeStoreFile(dataDir: string, store: AuthStore): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const target = storePath(dataDir);
  const staging = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(staging, encodeStore(store), { mode: 0o600 });
    await chmod(staging, 0o600);
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { force: true });
    throw error;
  }
}

// A pending sign-in written during an outage goes onto the session the file
// still holds, so a sign-in that was started but never finished keeps it.
// Null when the file did not decrypt, so there is nothing to merge onto.
async function onFileSession(dataDir: string, store: AuthStore): Promise<AuthStore | null> {
  const file = await readStoreFile(dataDir);
  if (file === null) {
    noteUndecryptable(dataDir);
    return null;
  }
  return { ...file, pkce: store.pkce };
}

// The file was read for the first time since an outage hid it: show its
// account again in every renderer.
function noteFileRead(dataDir: string, store: AuthStore): void {
  if (unreadFiles.delete(dataDir) && store.session) {
    notifyRenderersFn?.(publicAccount(store.session));
  }
}

/**
 * Whether the saved sign-in is hidden right now (secure storage is out, or
 * the file did not decrypt), so the signed-out store read from it is not a
 * sign-out. Callers that would clear account data on a signed-out read wait.
 */
export function isSavedSignInHidden(dataDir: string): boolean {
  return unreadFiles.has(dataDir);
}

/**
 * Reads the store again when a sign-in is waiting on secure storage and it is
 * available now. Nothing announces that storage is back, so the app calls
 * this when it is focused or the screen is unlocked: the read saves a sign-in
 * kept in memory and shows a hidden one again in every renderer.
 */
export function recheckSavedSignIn(dataDir: string): void {
  if (!unreadFiles.has(dataDir) && !memoryStores.has(dataDir)) return;
  if (!protectedStorageAvailable() || undecryptable.has(dataDir)) return;
  void readAuthStore(dataDir).catch(() => undefined);
}

export function readAuthStore(dataDir: string): Promise<AuthStore> {
  return serialize(storeOps, dataDir, async () => {
    const memory = memoryStores.get(dataDir);
    if (!protectedStorageAvailable() || undecryptable.has(dataDir)) {
      // An outage, such as a locked keychain or a keyring that has not started
      // yet, is often temporary. The file stays for when storage is back and
      // reads as signed out until then, unless this run signed in since.
      if (!memory?.replacesFile) unreadFiles.add(dataDir);
      return memory?.store ?? emptyStore();
    }
    if (memory) {
      // Storage is back: save what was kept in memory.
      const store = memory.replacesFile
        ? memory.store
        : await onFileSession(dataDir, memory.store);
      if (store === null) return memory.store;
      try {
        await writeStoreFile(dataDir, store);
      } catch {
        // Keep what was recovered, so a later write that carries the file's
        // session on is not taken for a new credential and the next read
        // tries the save again. It is still shown again in every renderer.
        memoryStores.set(dataDir, { ...memory, store });
        noteFileRead(dataDir, store);
        return store;
      }
      memoryStores.delete(dataDir);
      fileSessions.set(dataDir, store.session);
      noteFileRead(dataDir, store);
      return store;
    }
    const store = await readStoreFile(dataDir);
    if (store === null) {
      noteUndecryptable(dataDir);
      return emptyStore();
    }
    fileSessions.set(dataDir, store.session);
    noteFileRead(dataDir, store);
    return store;
  });
}

export function writeAuthStore(
  dataDir: string,
  store: AuthStore,
): Promise<void> {
  return serialize(storeOps, dataDir, async () => {
    if (!protectedStorageAvailable()) {
      // A rotating refresh token must never fall back to plaintext persistence.
      // Linux's basic_text backend also reports encryption as available despite
      // using an unprotected hardcoded password, so keep that process-local too.
      const memory = memoryStores.get(dataDir);
      const wasReplacing = memory?.replacesFile === true;
      // A store that only carries the session already held (in memory, or in
      // the file when it was last read) on, with a sign-in started or cleared,
      // keeps the file.
      const held = memory ? memory.store.session : fileSessions.get(dataDir);
      const newCredential = store.session !== null && !sameCredential(store.session, held);
      memoryStores.set(dataDir, { store, replacesFile: wasReplacing || newCredential });
      if (newCredential) {
        // This credential is newer than the file's. Delete the file so the
        // account it replaced can never come back.
        unreadFiles.delete(dataDir);
        undecryptable.delete(dataDir);
        fileSessions.delete(dataDir);
        await rm(storePath(dataDir), { force: true });
        if (!wasReplacing) {
          console.warn(
            "Orchestrator Cloud sign-in is kept in memory only: secure storage is unavailable, so it will not survive a restart until storage is available again.",
          );
        }
      }
      return;
    }
    // What is kept in memory is dropped only once the file is saved, so a
    // failed write cannot lose a sign-in held nowhere else.
    if (store.session === null && unreadFiles.has(dataDir)) {
      // Read during the outage, this store never saw the file's session.
      const next = undecryptable.has(dataDir) ? null : await onFileSession(dataDir, store);
      if (next === null) {
        // The file did not decrypt, so its session cannot be kept in a new
        // one. Hold this store (a pending sign-in) in memory and leave the
        // file for the next launch; a sign-in it completes is saved over it.
        memoryStores.set(dataDir, { store, replacesFile: false });
        return;
      }
      await writeStoreFile(dataDir, next);
      memoryStores.delete(dataDir);
      fileSessions.set(dataDir, next.session);
      noteFileRead(dataDir, next);
      return;
    }
    await writeStoreFile(dataDir, store);
    memoryStores.delete(dataDir);
    fileSessions.set(dataDir, store.session);
    unreadFiles.delete(dataDir);
    undecryptable.delete(dataDir);
  });
}

export function removeAuthStore(dataDir: string): Promise<void> {
  return serialize(storeOps, dataDir, async () => {
    memoryStores.delete(dataDir);
    unreadFiles.delete(dataDir);
    undecryptable.delete(dataDir);
    fileSessions.delete(dataDir);
    await Promise.all([
      rm(storePath(dataDir), { force: true }),
      rm(path.join(dataDir, LEGACY_SESSION_FILE), { force: true }),
    ]);
  });
}

export function publicAccount(session: StoredSession): CloudAccount {
  return {
    authProvider: session.authProvider,
    user: session.user,
    ...(session.organizations ? { organizations: session.organizations } : {}),
    storedAt: session.storedAt,
  };
}

export async function getCloudSession(
  dataDir: string,
): Promise<CloudAccount | null> {
  const store = await readAuthStore(dataDir);
  // Only local (opaque-token) sessions are usable. A session the removed
  // WorkOS sign-in saved reads as signed out.
  return isLocalSession(store.session) ? publicAccount(store.session) : null;
}

/**
 * The renderer's session read. Sessions never refresh any more, so this is
 * getCloudSession; kept as its own name for the IPC handler and callers.
 */
export async function getCloudSessionCached(
  dataDir: string,
): Promise<CloudAccount | null> {
  return getCloudSession(dataDir);
}

/**
 * Raw bearer token for the main-process control-plane proxy
 * (cloud-cp-proxy.ts). Main-process only: the token must never be sent to a
 * renderer or exposed over IPC.
 */
export async function getCloudAccessToken(
  dataDir: string,
): Promise<string | null> {
  const store = await readAuthStore(dataDir);
  if (isLocalSession(store.session)) return store.session.accessToken;
  // The auth store may also have been cleared by another dev-app process.
  // A proxied request is authoritative evidence that this renderer can no
  // longer use AO Cloud, so retire any cached signed-in UI. A sign-in hidden
  // by a secure storage outage is not gone: a signed-out notice would clear
  // the account's share links and previews, which do not come back with it.
  if (!isSavedSignInHidden(dataDir)) notifyRenderersFn?.(null);
  return null;
}

export async function signOutCloud(dataDir: string): Promise<void> {
  invalidateAuthOperations(dataDir);
  await withAuthMutation(dataDir, () => removeAuthStore(dataDir));
}

// registerCloudProtocol makes this build the ao-app:// handler (billing returns
// and session links), or gives the scheme up when it shouldn't hold it. Call it
// once this process is the app's single instance, before app.whenReady().
//
// A development build never claims ao-app://: claiming it takes the scheme from
// the installed app (macOS binds it to the stock node_modules Electron.app,
// Windows points it at a worktree script), so the installed app's links then
// land in the wrong process. Such a build only releases a claim an earlier dev
// run left behind. On macOS that hands the scheme back to the installed app at
// once; on Windows it deletes the stale entry, and the installed app takes the
// scheme again the next time it starts. Linux has no release (Electron's is a
// no-op there).
export function registerCloudProtocol(): void {
  if (!app.isPackaged) {
    // A dev build is launched as `electron <app dir>`; Windows ties the scheme
    // to that exact command, so the release names it.
    const devApp: [path?: string, args?: string[]] =
      process.defaultApp && process.argv.length >= 2
        ? [process.execPath, [path.resolve(process.argv[1])]]
        : [];
    if (process.platform !== "linux" && app.isDefaultProtocolClient("ao-app", ...devApp)) {
      app.removeAsDefaultProtocolClient("ao-app", ...devApp);
    }
    return;
  }
  app.setAsDefaultProtocolClient("ao-app");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The control plane's reason for refusing an account login (the same login is
// already saved, or a sign-in again used another login), from its error
// envelope's message. Never the response body itself.
async function controlPlaneRefusal(response: Response): Promise<string | undefined> {
  if (response.status !== 409 && response.status !== 422) return undefined;
  try {
    const envelope = (await response.json()) as { message?: unknown };
    return typeof envelope.message === "string" && envelope.message.trim() !== "" ? envelope.message.slice(0, 300) : undefined;
  } catch {
    return undefined;
  }
}

// Whether the control plane saved an account login as its harness's default
// account, from its answer ({ agentAccount: { isDefault } }).
async function savedAsDefaultAccount(response: Response): Promise<boolean> {
  try {
    const answer = (await response.json()) as { agentAccount?: { isDefault?: unknown } };
    return answer.agentAccount?.isDefault === true;
  } catch {
    return false;
  }
}

export function installCloudIPC(
  getDataDir: () => string,
  notifyRenderers: (session: CloudAccount | null) => void,
  // Runs before an explicit sign-out completes, so its effects are durable even
  // if the app quits right after.
  onSignedOut: () => Promise<void> = async () => undefined,
): void {
  notifyRenderersFn = notifyRenderers;
  ipcMain.handle("cloud:getSession", () => getCloudSessionCached(getDataDir()));
  ipcMain.handle("cloud:signIn", async () => {
    // WorkOS AuthKit sign-in was removed. The organization's LDAP sign-in will
    // take its place once the control plane accepts it; until then say so
    // rather than open anything.
    const ldap = ldapSignInConfig();
    await dialog.showMessageBox({
      type: "info",
      title: "Orchestrator Cloud sign-in",
      message: "Orchestrator Cloud sign-in is not available yet.",
      detail: ldap
        ? `LDAP sign-in (${ldap.url}) is configured but not connected to the control plane yet.`
        : "Set VITE_AO_LDAP_URL when building to point sign-in at your LDAP directory.",
    });
  });
  ipcMain.handle("cloud:signOut", async () => {
    const dataDir = getDataDir();
    // A local (opaque-token) session is revoked server-side first, best-effort.
    // Store removal is uniform via signOutCloud.
    try {
      const store = await readAuthStore(dataDir);
      if (isLocalSession(store.session)) {
        await revokeLocalSession(store.session);
      }
    } catch {
      // Sign-out must never fail on a revoke round-trip; clear the store anyway.
    }
    await signOutCloud(dataDir);
    await onSignedOut().catch(() => undefined);
    notifyRenderers(null);
  });
  ipcMain.handle("cloud:cancelProviderAuth", async () => {
    if (activeProviderAuthAbort) {
      activeProviderAuthAbort.abort();
      activeProviderAuthAbort = null;
    }
  });
  ipcMain.handle("cloud:connectProviderAuth", async (_event, input: unknown) => {
    if (typeof input !== "object" || input === null) throw new Error("Invalid Cloud provider login request.");
    const { baseUrl, provider, persistLocalClaudeToken, account } = input as Record<string, unknown>;
    if (typeof baseUrl !== "string" || typeof provider !== "string") throw new Error("Invalid Cloud provider login request.");
    // account: "new" saves the login as another account, an account id signs
    // that account in again; absent, the login replaces the agent's default.
    if (account !== undefined && account !== "new" && !(typeof account === "string" && UUID_PATTERN.test(account))) throw new Error("Invalid Cloud provider login request.");
    let base: URL;
    try {
      base = new URL(baseUrl);
    } catch {
      throw new Error("Cloud control plane URL is invalid.");
    }
    if (base.protocol !== "https:" && !(base.protocol === "http:" && (base.hostname === "localhost" || base.hostname === "127.0.0.1"))) throw new Error("Cloud control plane must use HTTPS.");
    if (base.username !== "" || base.password !== "" || base.search !== "" || base.hash !== "") throw new Error("Cloud control plane URL must not include credentials, a query string, or a fragment.");
    const dataDir = getDataDir();
    const token = await getCloudAccessToken(dataDir);
    if (!token) throw new Error("Sign in to Orchestrator Cloud before connecting a provider.");
    
    if (activeProviderAuthAbort) activeProviderAuthAbort.abort();
    activeProviderAuthAbort = new AbortController();
    let credential;
    try {
      credential = await providerAuthFlow(provider).authenticate(dataDir, activeProviderAuthAbort.signal);
    } finally {
      activeProviderAuthAbort = null;
    }

    if (credential.provider !== provider) throw new Error("Cloud provider login returned an unexpected provider.");

    if (provider === "github") {
      // Returned to the renderer, which saves it via the daemon's
      // PUT /api/v1/github/pat endpoint. Include the OAuth refresh material so
      // the daemon can renew an expiring GitHub App token without a reconnect.
      return {
        secret: credential.secret,
        refreshToken: credential.refreshToken,
        expiresIn: credential.expiresIn,
        refreshTokenExpiresIn: credential.refreshTokenExpiresIn,
      };
    }

    const basePath = base.pathname.replace(/\/+$/, "");
    // Cloud agent credentials are always personal: the caller's own connection,
    // usable in every org they belong to.
    const save = account === "new"
      ? { method: "POST", path: "/me/agent-accounts", body: { agent: credential.provider, credentialType: credential.credentialType, secret: credential.secret } }
      : typeof account === "string"
        ? { method: "PUT", path: `/me/agent-accounts/${account}/credential`, body: { credentialType: credential.credentialType, secret: credential.secret } }
        : { method: "PUT", path: `/me/providers/${encodeURIComponent(credential.provider)}`, body: { credentialType: credential.credentialType, secret: credential.secret } };
    const target = new URL(`${base.origin}${basePath}/api/cloud/v1${save.path}`);
    const response = await fetch(target, {
      method: save.method,
      redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(save.body),
    });
    if (!response.ok) throw new Error(await controlPlaneRefusal(response) ?? "Orchestrator Cloud could not save the provider credential.");

    // Persist the captured Claude setup-token locally as a fallback for local
    // sessions, only once the cloud copy is saved: a failed cloud save must not
    // leave a local login behind. The daemon's claudecode adapter injects it only
    // when no native login is present, so it never shadows an existing login.
    // Of a harness's several accounts only the default's: the control plane
    // says which account the login became (an added one is the default when it
    // is the first, or when the default stopped working).
    if (persistLocalClaudeToken === true && credential.provider === "claude-code" && credential.credentialType === "oauth_token" &&
      (account === undefined || await savedAsDefaultAccount(response))) {
      await persistLocalClaudeOAuthToken(dataDir, credential.secret);
    }
    return undefined;
  });
}
