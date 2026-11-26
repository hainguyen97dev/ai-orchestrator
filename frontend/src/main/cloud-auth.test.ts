import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { StoredSession } from "./cloud-auth";

const ACCESS_TOKEN = "ao_local_person_token";
const OTHER_TOKEN = "ao_local_other_token";

const mocks = vi.hoisted(() => ({
  decryptString: vi.fn((value: Buffer) => value.toString("utf8")),
  encryptString: vi.fn((value: string) => Buffer.from(value, "utf8")),
  encryptionAvailable: true,
  selectedStorageBackend: "gnome_libsecret",
  ipcHandle: vi.fn(),
  notifyRenderers: vi.fn(),
  showMessageBox: vi.fn(),
  providerAuthenticate: vi.fn(),
  // Error codes the next reads of the login file fail with, one per read.
  storeReadFailures: [] as string[],
  storeReads: 0,
}));

// Reads of the login file can be made to fail with a chosen code; every other
// file operation is the real one.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const readFile = ((...args: Parameters<typeof actual.readFile>) => {
    if (String(args[0]).endsWith("cloud-auth.bin")) {
      mocks.storeReads += 1;
      const code = mocks.storeReadFailures.shift();
      if (code) return Promise.reject(Object.assign(new Error(`${code}: synthetic read failure`), { code }));
    }
    return actual.readFile(...args);
  }) as typeof actual.readFile;
  return { ...actual, readFile, default: { ...actual, readFile } };
});

// The browser login itself is exercised in provider-auth-flow tests; here it
// just returns a captured credential.
vi.mock("./provider-auth-flow", () => ({
  providerAuthFlow: () => ({ authenticate: mocks.providerAuthenticate }),
}));

vi.mock("electron", () => ({
  app: {
    isDefaultProtocolClient: vi.fn(() => false),
    once: vi.fn(),
    removeAsDefaultProtocolClient: vi.fn(),
    setAsDefaultProtocolClient: vi.fn(),
    isPackaged: true,
  },
  dialog: { showMessageBox: mocks.showMessageBox },
  ipcMain: { handle: mocks.ipcHandle },
  safeStorage: {
    decryptString: mocks.decryptString,
    encryptString: mocks.encryptString,
    getSelectedStorageBackend: () => mocks.selectedStorageBackend,
    isEncryptionAvailable: () => mocks.encryptionAvailable,
  },
}));

import {
  AuthStoreUnreadableError,
  getCloudAccessToken,
  getCloudSession,
  installCloudIPC,
  readAuthStore,
  resolveCloudAuthDir,
  signOutCloud,
  writeAuthStore,
} from "./cloud-auth";

type CloudAuth = typeof import("./cloud-auth");

const PERSON = { id: "user_123", email: "person@example.com", displayName: "Person Example" };
const OTHER = { id: "user_456", email: "other@example.com", displayName: "Other Person" };

function localSession(user = PERSON, accessToken = ACCESS_TOKEN): StoredSession {
  return {
    accessToken,
    authProvider: "local",
    user,
    storedAt: new Date().toISOString(),
    cpBaseUrl: "http://127.0.0.1:8080",
  };
}

// Saves a session the way a completed sign-in does (cloud-auth-local's save).
async function signInWith(auth: CloudAuth, dataDir: string, user = PERSON, accessToken = ACCESS_TOKEN) {
  const session = localSession(user, accessToken);
  auth.invalidateAuthOperations(dataDir);
  return auth.withAuthMutation(dataDir, async () => {
    await auth.writeAuthStore(dataDir, { session, pkce: null });
    return auth.publicAccount(session);
  });
}

describe("cloud authentication", () => {
  let dataDir: string;
  let cloudAuth: CloudAuth;
  const signIn = (user = PERSON, accessToken = ACCESS_TOKEN) => signInWith(cloudAuth, dataDir, user, accessToken);

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.storeReadFailures = [];
    mocks.storeReads = 0;
    mocks.encryptionAvailable = true;
    mocks.selectedStorageBackend = "gnome_libsecret";
    dataDir = await mkdtemp(path.join(os.tmpdir(), "ao-cloud-auth-"));
    cloudAuth = await import("./cloud-auth");
    installCloudIPC(() => dataDir, mocks.notifyRenderers);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dataDir, { recursive: true, force: true });
  });

  describe("with WorkOS removed", () => {
    it("says sign-in is not available yet instead of opening anything", async () => {
      const handler = mocks.ipcHandle.mock.calls.find(([channel]) => channel === "cloud:signIn")?.[1] as () => Promise<void>;
      const fetchMock = vi.spyOn(globalThis, "fetch");
      await expect(handler()).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
        type: "info",
        message: "Orchestrator Cloud sign-in is not available yet.",
      }));
    });

    it("reads a session the removed WorkOS sign-in saved as signed out, with no token", async () => {
      await writeAuthStore(dataDir, {
        session: { ...localSession(), authProvider: "workos", accessToken: "header.payload.signature", refreshToken: "refresh_123" },
        pkce: null,
      });
      await expect(getCloudSession(dataDir)).resolves.toBeNull();
      await expect(cloudAuth.getCloudSessionCached(dataDir)).resolves.toBeNull();
      await expect(getCloudAccessToken(dataDir)).resolves.toBeNull();
      expect(mocks.notifyRenderers).toHaveBeenCalledWith(null);
    });

    it("returns a local session and its token as saved", async () => {
      await signIn();
      await expect(getCloudSession(dataDir)).resolves.toMatchObject({ authProvider: "local", user: { email: "person@example.com" } });
      await expect(getCloudAccessToken(dataDir)).resolves.toBe(ACCESS_TOKEN);
    });
  });

  it("requires an AO Cloud session before starting provider login", async () => {
    const handler = mocks.ipcHandle.mock.calls.find(
      ([channel]) => channel === "cloud:connectProviderAuth",
    )?.[1] as ((event: unknown, input: unknown) => Promise<void>) | undefined;
    expect(handler).toBeTypeOf("function");
    await expect(
      handler?.({}, {
        baseUrl: "https://cloud.example",
        provider: "codex",
      }),
    ).rejects.toThrow("Sign in to Orchestrator Cloud before connecting a provider.");
  });

  describe("Claude browser login local fallback token", () => {
    const tokenFile = () => path.join(dataDir, "harnesses", "claude-code", "oauth-token");
    const connect = async () => {
      const handler = mocks.ipcHandle.mock.calls.find(
        ([channel]) => channel === "cloud:connectProviderAuth",
      )?.[1] as (event: unknown, input: unknown) => Promise<void>;
      return handler({}, { baseUrl: "https://cloud.example", provider: "claude-code", persistLocalClaudeToken: true });
    };

    beforeEach(async () => {
      await signIn();
      mocks.providerAuthenticate.mockResolvedValue({
        provider: "claude-code",
        credentialType: "oauth_token",
        secret: "sk-ant-oat01-test-token",
      });
    });

    it("keeps the local token once the cloud credential is saved", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
      await connect();
      await expect(readFile(tokenFile(), "utf8")).resolves.toBe("sk-ant-oat01-test-token");
    });

    it("does not leave a local token behind when the cloud save fails", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
      await expect(connect()).rejects.toThrow("Orchestrator Cloud could not save the provider credential.");
      await expect(readFile(tokenFile(), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("does not leave a local token behind when the cloud is unreachable", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
      await expect(connect()).rejects.toThrow("fetch failed");
      await expect(readFile(tokenFile(), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });

    // Local sessions use the default account's login: an account login is
    // kept locally only when the control plane saved it as the default.
    const connectAccount = async (account: string) => {
      const handler = mocks.ipcHandle.mock.calls.find(
        ([channel]) => channel === "cloud:connectProviderAuth",
      )?.[1] as (event: unknown, input: unknown) => Promise<void>;
      return handler({}, { baseUrl: "https://cloud.example", provider: "claude-code", persistLocalClaudeToken: true, account });
    };

    it("keeps an added account's token only when the control plane made it the default", async () => {
      const answer = (isDefault: boolean) => new Response(JSON.stringify({ agentAccount: { id: "a", isDefault } }), { status: 201 });
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(answer(false));
      await connectAccount("new");
      await expect(readFile(tokenFile(), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(answer(true));
      await connectAccount("new");
      await expect(readFile(tokenFile(), "utf8")).resolves.toBe("sk-ant-oat01-test-token");
    });

    it("keeps a signed-in-again account's token only when it is the default", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ agentAccount: { id: "a", isDefault: false } }), { status: 200 }));
      await connectAccount("33333333-3333-4333-8333-333333333333");
      await expect(readFile(tokenFile(), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  describe("Cloud agent accounts", () => {
    const connect = (account: unknown) => {
      const handler = mocks.ipcHandle.mock.calls.find(
        ([channel]) => channel === "cloud:connectProviderAuth",
      )?.[1] as (event: unknown, input: unknown) => Promise<void>;
      return handler({}, { baseUrl: "https://cloud.example", provider: "codex", account });
    };
    const accountId = "33333333-3333-4333-8333-333333333333";

    beforeEach(async () => {
      await signIn();
      mocks.providerAuthenticate.mockResolvedValue({ provider: "codex", credentialType: "auth_json", secret: "{\"tokens\":{}}" });
    });

    it("saves a login as another account, or signs an account in again", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
      await connect("new");
      await connect(accountId);
      const requests = fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), method: init?.method, body: JSON.parse(String(init?.body)) }));
      expect(requests).toEqual([
        { url: "https://cloud.example/api/cloud/v1/me/agent-accounts", method: "POST", body: { agent: "codex", credentialType: "auth_json", secret: "{\"tokens\":{}}" } },
        { url: `https://cloud.example/api/cloud/v1/me/agent-accounts/${accountId}/credential`, method: "PUT", body: { credentialType: "auth_json", secret: "{\"tokens\":{}}" } },
      ]);
    });

    it("refuses an account that is not an id before the login starts", async () => {
      await expect(connect("../providers/codex")).rejects.toThrow("Invalid Cloud provider login request.");
      expect(mocks.providerAuthenticate).not.toHaveBeenCalled();
    });

    it("shows why the control plane refused the login", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: "AGENT_ACCOUNT_DUPLICATE", message: "That login is already saved." }), { status: 409 }));
      await expect(connect("new")).rejects.toThrow("That login is already saved.");
    });
  });

  it("keeps the auth store in memory when OS encryption is unavailable", async () => {
    mocks.encryptionAvailable = false;
    await expect(signIn()).resolves.toMatchObject({ user: { email: "person@example.com" } });
    await expect(
      readFile(path.join(dataDir, "cloud-auth.bin")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(getCloudSession(dataDir)).resolves.toMatchObject({
      user: { email: "person@example.com" },
    });
    await signOutCloud(dataDir);
  });

  it("keeps the auth store in memory with Linux basic_text storage", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    mocks.selectedStorageBackend = "basic_text";
    await expect(signIn()).resolves.toMatchObject({ user: { email: "person@example.com" } });
    await expect(
      readFile(path.join(dataDir, "cloud-auth.bin")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(getCloudSession(dataDir)).resolves.toMatchObject({
      user: { email: "person@example.com" },
    });
    await signOutCloud(dataDir);
  });

  // Secure storage can be out for a while: a locked keychain, or a Linux
  // keyring that had not started when the app did (basic_text for that run).
  describe("through a secure storage outage", () => {
    const storeFile = () => path.join(dataDir, "cloud-auth.bin");
    const fileStore = async () => JSON.parse(await readFile(storeFile(), "utf8")) as Record<string, unknown>;
    const signedInAs = (email: string) => expect.objectContaining({ user: expect.objectContaining({ email }) });
    let warn: MockInstance<typeof console.warn>;

    beforeEach(() => {
      warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      mocks.decryptString.mockImplementation((value: Buffer) => value.toString("utf8"));
    });

    // A fresh copy of the module: what the app holds in memory is gone, the
    // file on disk stays.
    async function restart(): Promise<CloudAuth> {
      vi.resetModules();
      const auth = await import("./cloud-auth");
      auth.installCloudIPC(() => dataDir, mocks.notifyRenderers);
      return auth;
    }

    const outages: Array<[string, () => void]> = [
      ["encryption is unavailable", () => {
        mocks.encryptionAvailable = false;
      }],
      ["Linux falls back to basic_text", () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("linux");
        mocks.selectedStorageBackend = "basic_text";
      }],
    ];
    const storageBack = () => {
      mocks.encryptionAvailable = true;
      mocks.selectedStorageBackend = "gnome_libsecret";
    };

    it.each(outages)("keeps the saved sign-in when %s at launch, and shows it again once storage is back", async (_name, outage) => {
      await signInWith(await restart(), dataDir);
      outage();
      const auth = await restart();

      await expect(auth.getCloudSession(dataDir)).resolves.toBeNull();
      await expect(readFile(storeFile())).resolves.toBeInstanceOf(Buffer);

      storageBack();
      await expect(auth.getCloudSession(dataDir)).resolves.toEqual(signedInAs("person@example.com"));
      expect(mocks.notifyRenderers).toHaveBeenCalledWith(signedInAs("person@example.com"));
      await expect((await restart()).getCloudSession(dataDir)).resolves.toEqual(signedInAs("person@example.com"));
    });

    it("saves a sign-in made during the outage over the older saved account once storage is back", async () => {
      await signInWith(await restart(), dataDir);
      mocks.encryptionAvailable = false;
      const auth = await restart();
      await signInWith(auth, dataDir, OTHER, OTHER_TOKEN);

      storageBack();
      await expect(auth.getCloudSession(dataDir)).resolves.toEqual(signedInAs("other@example.com"));
      expect(await fileStore()).toMatchObject({ session: { accessToken: OTHER_TOKEN, user: { email: "other@example.com" } } });
      await expect((await restart()).getCloudSession(dataDir)).resolves.toEqual(signedInAs("other@example.com"));
    });

    it("says a sign-in made during the outage will not survive a restart, and never brings back the account it replaced", async () => {
      await signInWith(await restart(), dataDir);
      mocks.encryptionAvailable = false;
      let auth = await restart();

      await expect(signInWith(auth, dataDir, OTHER, OTHER_TOKEN)).resolves.toEqual(signedInAs("other@example.com"));
      await expect(readFile(storeFile())).rejects.toMatchObject({ code: "ENOENT" });
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain("will not survive a restart");

      auth = await restart();
      await expect(auth.getCloudSession(dataDir)).resolves.toBeNull();
      storageBack();
      await expect(auth.getCloudSession(dataDir)).resolves.toBeNull();
      await expect(readFile(storeFile())).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("keeps the saved sign-in when storage drops between reading it and saving a store that carries it on, even across a restart", async () => {
      await signInWith(await restart(), dataDir);
      let auth = await restart();
      const store = await auth.readAuthStore(dataDir);
      mocks.encryptionAvailable = false;
      await auth.writeAuthStore(dataDir, { ...store, pkce: { codeVerifier: "verifier_456", state: "state_456", expiresAt: Date.now() + 60_000 } });

      await expect(readFile(storeFile())).resolves.toBeInstanceOf(Buffer);
      expect(warn).not.toHaveBeenCalled();
      await expect(auth.getCloudSession(dataDir)).resolves.toEqual(signedInAs("person@example.com"));

      auth = await restart();
      storageBack();
      await expect(auth.getCloudSession(dataDir)).resolves.toEqual(signedInAs("person@example.com"));
    });

    it("removes the saved sign-in for good when signing out during the outage", async () => {
      await signInWith(await restart(), dataDir);
      mocks.encryptionAvailable = false;
      const auth = await restart();

      await auth.signOutCloud(dataDir);
      await expect(readFile(storeFile())).rejects.toMatchObject({ code: "ENOENT" });

      storageBack();
      await expect(auth.getCloudSession(dataDir)).resolves.toBeNull();
      await expect((await restart()).getCloudSession(dataDir)).resolves.toBeNull();
      expect(mocks.notifyRenderers).not.toHaveBeenCalledWith(signedInAs("person@example.com"));
    });

    it("does not tell the renderers the account signed out when a token is asked for during the outage", async () => {
      await signInWith(await restart(), dataDir);
      mocks.encryptionAvailable = false;
      const auth = await restart();

      await expect(auth.getCloudAccessToken(dataDir)).resolves.toBeNull();
      expect(auth.isSavedSignInHidden(dataDir)).toBe(true);
      expect(mocks.notifyRenderers).not.toHaveBeenCalledWith(null);
    });

    it("shows the saved sign-in again when the app is focused once storage is back", async () => {
      await signInWith(await restart(), dataDir);
      mocks.encryptionAvailable = false;
      const auth = await restart();
      await expect(auth.getCloudSession(dataDir)).resolves.toBeNull();

      auth.recheckSavedSignIn(dataDir);
      await Promise.resolve();
      expect(mocks.notifyRenderers).not.toHaveBeenCalledWith(signedInAs("person@example.com"));

      storageBack();
      auth.recheckSavedSignIn(dataDir);
      await vi.waitFor(() => expect(mocks.notifyRenderers).toHaveBeenCalledWith(signedInAs("person@example.com")));
      expect(auth.isSavedSignInHidden(dataDir)).toBe(false);
    });

    it("keeps a saved sign-in that does not decrypt, without asking the keychain again, until the next launch", async () => {
      await signInWith(await restart(), dataDir);
      const auth = await restart();
      mocks.decryptString.mockImplementation(() => {
        throw new Error("keychain access denied");
      });
      mocks.decryptString.mockClear();

      await expect(auth.getCloudSession(dataDir)).resolves.toBeNull();
      await expect(auth.getCloudSession(dataDir)).resolves.toBeNull();
      expect(mocks.decryptString).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledOnce();
      expect(auth.isSavedSignInHidden(dataDir)).toBe(true);
      await expect(auth.getCloudAccessToken(dataDir)).resolves.toBeNull();
      expect(mocks.notifyRenderers).not.toHaveBeenCalledWith(null);

      mocks.decryptString.mockImplementation((value: Buffer) => value.toString("utf8"));
      await expect((await restart()).getCloudSession(dataDir)).resolves.toEqual(signedInAs("person@example.com"));
    });

    it("saves a new sign-in over a saved one that does not decrypt", async () => {
      await signInWith(await restart(), dataDir);
      const auth = await restart();
      mocks.decryptString.mockImplementationOnce(() => {
        throw new Error("keychain access denied");
      });
      await expect(auth.getCloudSession(dataDir)).resolves.toBeNull();

      await signInWith(auth, dataDir, OTHER, OTHER_TOKEN);

      expect(await fileStore()).toMatchObject({ session: { accessToken: OTHER_TOKEN }, pkce: null });
      expect(auth.isSavedSignInHidden(dataDir)).toBe(false);
      await expect((await restart()).getCloudSession(dataDir)).resolves.toEqual(signedInAs("other@example.com"));
    });
  });

  it("publishes signed-out state when a token request finds the auth store missing", async () => {
    await expect(getCloudAccessToken(dataDir)).resolves.toBeNull();
    expect(mocks.notifyRenderers).toHaveBeenCalledWith(null);
  });

  it("signs out locally", async () => {
    await signIn();
    await signOutCloud(dataDir);
    await expect(getCloudSession(dataDir)).resolves.toBeNull();
  });

  describe("a saved login the app cannot read just now", () => {
    const storeFile = () => path.join(dataDir, "cloud-auth.bin");

    beforeEach(async () => {
      await signIn();
      mocks.notifyRenderers.mockClear();
      mocks.storeReads = 0;
    });

    it("reads the login once the file handles free up", async () => {
      mocks.storeReadFailures = ["EMFILE", "EMFILE"];

      await expect(getCloudSession(dataDir)).resolves.toMatchObject({
        user: { email: "person@example.com" },
      });
      expect(mocks.storeReads).toBe(3);
    });

    it("keeps the login file when reads keep failing, and finds the login on the next read", async () => {
      const saved = await readFile(storeFile());
      mocks.storeReadFailures = ["EMFILE", "EMFILE", "EMFILE", "EMFILE"];

      const failed = await getCloudSession(dataDir).catch((error: unknown) => error);
      expect(failed).toBeInstanceOf(AuthStoreUnreadableError);
      expect(failed).toMatchObject({ code: "EMFILE" });
      // Only the code, never where the login is kept.
      expect((failed as Error).message).not.toContain(dataDir);
      expect(mocks.storeReadFailures).toEqual([]);
      await expect(readFile(storeFile())).resolves.toEqual(saved);
      expect(mocks.notifyRenderers).not.toHaveBeenCalled();

      await expect(getCloudSession(dataDir)).resolves.toMatchObject({
        user: { email: "person@example.com" },
      });
      await expect(readFile(storeFile())).resolves.toEqual(saved);
    });

    it("does not tell the proxies or renderers the account signed out", async () => {
      const saved = await readFile(storeFile());
      mocks.storeReadFailures = ["EMFILE", "EMFILE", "EMFILE", "EMFILE"];

      await expect(getCloudAccessToken(dataDir)).rejects.toBeInstanceOf(
        AuthStoreUnreadableError,
      );
      expect(mocks.notifyRenderers).not.toHaveBeenCalled();
      await expect(readFile(storeFile())).resolves.toEqual(saved);

      await expect(getCloudAccessToken(dataDir)).resolves.toBe(ACCESS_TOKEN);
    });

    it("keeps the login file without retrying a read it has no permission for", async () => {
      const saved = await readFile(storeFile());
      mocks.storeReads = 0;
      mocks.storeReadFailures = ["EACCES"];

      await expect(getCloudSession(dataDir)).rejects.toMatchObject({
        code: "EACCES",
      });
      expect(mocks.storeReads).toBe(1);
      await expect(readFile(storeFile())).resolves.toEqual(saved);
      await expect(getCloudSession(dataDir)).resolves.toMatchObject({
        user: { email: "person@example.com" },
      });
    });

    it("still signs out from the app menu when the login cannot be read", async () => {
      const signOut = mocks.ipcHandle.mock.calls.find(
        ([channel]) => channel === "cloud:signOut",
      )?.[1] as () => Promise<void>;
      mocks.storeReadFailures = ["EACCES"];

      await signOut();

      await expect(readFile(storeFile())).rejects.toMatchObject({ code: "ENOENT" });
      expect(mocks.notifyRenderers).toHaveBeenCalledWith(null);
      await expect(getCloudSession(dataDir)).resolves.toBeNull();
    });

    it("treats a missing login file as signed out without creating one", async () => {
      await rm(storeFile());

      await expect(getCloudSession(dataDir)).resolves.toBeNull();
      await expect(readFile(storeFile())).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("removes a login file that reads but cannot be decoded", async () => {
      await writeFile(storeFile(), "not an encrypted store");

      await expect(getCloudSession(dataDir)).resolves.toBeNull();
      await expect(readFile(storeFile())).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("reads back what was written", async () => {
      await expect(readAuthStore(dataDir)).resolves.toMatchObject({ session: { accessToken: ACCESS_TOKEN } });
    });
  });
});

// registerCloudProtocol decides from how the build was launched; the platform
// only decides whether a claim can be released (not on Linux), so each case
// pins process.platform.
describe("registerCloudProtocol", () => {
  const argv = process.argv;
  const defaultApp = Object.getOwnPropertyDescriptor(process, "defaultApp");
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const devScript = path.resolve("/worktree/frontend");

  afterEach(async () => {
    vi.resetModules();
    const { app } = await import("electron");
    (app as { isPackaged: boolean }).isPackaged = true;
    vi.mocked(app.isDefaultProtocolClient).mockReturnValue(false);
    process.argv = argv;
    if (defaultApp) Object.defineProperty(process, "defaultApp", defaultApp);
    else delete (process as { defaultApp?: boolean }).defaultApp;
    Object.defineProperty(process, "platform", platform);
  });

  // The electron mock survives resetModules, so its calls are cleared here. A
  // dev build is launched as `electron <app dir>`, which sets
  // process.defaultApp; a packaged build leaves it unset.
  async function load(options: {
    isPackaged: boolean;
    ownsScheme?: boolean;
    platform?: NodeJS.Platform;
    argv?: string[];
  }) {
    vi.resetModules();
    if (options.isPackaged) delete (process as { defaultApp?: boolean }).defaultApp;
    else (process as { defaultApp?: boolean }).defaultApp = true;
    process.argv = options.argv ?? (options.isPackaged ? [process.execPath] : [process.execPath, devScript]);
    Object.defineProperty(process, "platform", { ...platform, value: options.platform ?? "darwin" });
    const { app } = await import("electron");
    vi.clearAllMocks();
    (app as { isPackaged: boolean }).isPackaged = options.isPackaged;
    vi.mocked(app.isDefaultProtocolClient).mockReturnValue(options.ownsScheme ?? false);
    const { registerCloudProtocol } = await import("./cloud-auth");
    return { app, registerCloudProtocol };
  }

  it("claims ao-app:// for the packaged app, and keeps it", async () => {
    const { app, registerCloudProtocol } = await load({ isPackaged: true });
    registerCloudProtocol();
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith("ao-app");
    expect(app.removeAsDefaultProtocolClient).not.toHaveBeenCalled();
    expect(app.once).not.toHaveBeenCalled();
  });

  it("claims the bare scheme for a packaged app launched with a deep link", async () => {
    // Windows and Linux start the installed app with the link as argv[1].
    const { app, registerCloudProtocol } = await load({
      isPackaged: true,
      argv: [process.execPath, "ao-app://billing"],
      platform: "win32",
    });
    registerCloudProtocol();
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith("ao-app");
  });

  it("keeps a dev build from claiming ao-app://", async () => {
    const { app, registerCloudProtocol } = await load({ isPackaged: false });
    registerCloudProtocol();
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
    expect(app.removeAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  it.each(["darwin", "win32"] as const)("hands ao-app:// back on %s when an earlier dev run took it", async (os) => {
    const { app, registerCloudProtocol } = await load({ isPackaged: false, ownsScheme: true, platform: os });
    registerCloudProtocol();
    // Windows only matches (and removes) the registration for this exact
    // executable and script.
    expect(app.isDefaultProtocolClient).toHaveBeenCalledWith("ao-app", process.execPath, [devScript]);
    expect(app.removeAsDefaultProtocolClient).toHaveBeenCalledWith("ao-app", process.execPath, [devScript]);
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  it("leaves the scheme alone for a dev build on Linux, which cannot release it", async () => {
    const { app, registerCloudProtocol } = await load({ isPackaged: false, ownsScheme: true, platform: "linux" });
    registerCloudProtocol();
    expect(app.isDefaultProtocolClient).not.toHaveBeenCalled();
    expect(app.removeAsDefaultProtocolClient).not.toHaveBeenCalled();
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  it("releases with the bare scheme when a dev build has no app path", async () => {
    const { app, registerCloudProtocol } = await load({ isPackaged: false, ownsScheme: true, argv: [process.execPath] });
    expect(() => registerCloudProtocol()).not.toThrow();
    expect(app.isDefaultProtocolClient).toHaveBeenCalledWith("ao-app");
    expect(app.removeAsDefaultProtocolClient).toHaveBeenCalledWith("ao-app");
  });
});

describe("resolveCloudAuthDir", () => {
  it("keeps the sign-in in the configured data dir, so instances with their own data dir never share an account", () => {
    const home = "/Users/someone";
    const first = resolveCloudAuthDir({ AO_DATA_DIR: "/tmp/ao/alice" }, home, "/work", false);
    const second = resolveCloudAuthDir({ AO_DATA_DIR: "/tmp/ao/bob" }, home, "/work", false);
    expect(first).toBe("/tmp/ao/alice");
    expect(second).toBe("/tmp/ao/bob");
    expect(resolveCloudAuthDir({ AO_DATA_DIR: " relative/data " }, home, "/work", true)).toBe("/work/relative/data");
  });

  it("uses ~/.ao for a packaged build and ~/.ao/dev for a development build", () => {
    expect(resolveCloudAuthDir({}, "/Users/someone", "/work", true)).toBe("/Users/someone/.ao");
    expect(resolveCloudAuthDir({ AO_DATA_DIR: "  " }, "/Users/someone", "/work", false)).toBe("/Users/someone/.ao/dev");
  });
});

describe("cloud:signOut", () => {
  it("finishes the signed-out hook before telling the renderers", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "ao-cloud-auth-"));
    const order: string[] = [];
    mocks.ipcHandle.mockClear();
    mocks.notifyRenderers.mockImplementation(() => order.push("notified"));
    installCloudIPC(() => dataDir, mocks.notifyRenderers, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("telemetry retired");
    });
    const handler = mocks.ipcHandle.mock.calls.find(([channel]) => channel === "cloud:signOut")?.[1] as () => Promise<void>;
    await handler();
    expect(order).toEqual(["telemetry retired", "notified"]);
    await rm(dataDir, { recursive: true, force: true });
  });
});

describe("cloud:signOut with telemetry", () => {
  it("retires a handed-off account's telemetry binding before renderers are told, with the daemon down", async () => {
    const { existsSync } = await import("node:fs");
    const { readFile, writeFile } = await import("node:fs/promises");
    const { TelemetryIdentityController } = await import("./telemetry-identity");
    const telemetryDir = await mkdtemp(path.join(os.tmpdir(), "ao-telemetry-"));
    const authDir = await mkdtemp(path.join(os.tmpdir(), "ao-cloud-auth-"));
    let daemonUp = true;
    const fetcher = vi.fn(async () => {
      if (!daemonUp) throw new Error("connection refused");
      return new Response(null, { status: 204 });
    });
    const ctl = new TelemetryIdentityController(telemetryDir, () => "http://127.0.0.1:4010", fetcher as never);
    // A normal signed-in hand-off: the daemon recorded user_A.
    expect(await ctl.setCloudUser("user_A")).toBe(true);
    await writeFile(path.join(telemetryDir, "telemetry_bound_user"), "user_A\n");
    await writeFile(path.join(telemetryDir, "telemetry_anonymous_id"), "anon_linked\n");
    daemonUp = false;

    const bindingAtNotify: boolean[] = [];
    mocks.ipcHandle.mockClear();
    installCloudIPC(() => authDir, () => {
      bindingAtNotify.push(existsSync(path.join(telemetryDir, "telemetry_bound_user")));
    }, () => ctl.signOut());
    const handler = mocks.ipcHandle.mock.calls.find(([channel]) => channel === "cloud:signOut")?.[1] as () => Promise<void>;
    await handler();

    expect(bindingAtNotify).toEqual([false]);
    expect((await readFile(path.join(telemetryDir, "telemetry_anonymous_id"), "utf8")).trim()).not.toBe("anon_linked");
    await rm(telemetryDir, { recursive: true, force: true });
    await rm(authDir, { recursive: true, force: true });
  });
});
