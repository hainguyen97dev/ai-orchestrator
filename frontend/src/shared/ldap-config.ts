/**
 * LDAP sign-in configuration, read when the app is built. It replaces the
 * removed WorkOS AuthKit sign-in.
 *
 *   VITE_AO_LDAP_URL      ldap:// or ldaps:// URL of the directory, e.g.
 *                         ldaps://ldap.example.com:636. Unset: no LDAP sign-in.
 *   VITE_AO_LDAP_BASE_DN  Optional search base, e.g. ou=people,dc=example,dc=com.
 *
 * These only say where the directory is; they are public configuration, never
 * credentials. Checking a password against the directory is the control
 * plane's job: the desktop never binds to LDAP itself.
 */
export interface LdapSignInConfig {
	url: string;
	baseDn?: string;
}

export function parseLdapSignInConfig(rawUrl: string | undefined, rawBaseDn?: string): LdapSignInConfig | null {
	const value = rawUrl?.trim() ?? "";
	if (value === "") return null;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`VITE_AO_LDAP_URL must be an ldap:// or ldaps:// URL; got ${JSON.stringify(rawUrl)}.`);
	}
	if (url.protocol !== "ldap:" && url.protocol !== "ldaps:") {
		throw new Error(`VITE_AO_LDAP_URL must be an ldap:// or ldaps:// URL; got ${JSON.stringify(rawUrl)}.`);
	}
	if (url.username !== "" || url.password !== "") {
		throw new Error("VITE_AO_LDAP_URL must not include credentials.");
	}
	const baseDn = rawBaseDn?.trim();
	return { url: value, ...(baseDn ? { baseDn } : {}) };
}
