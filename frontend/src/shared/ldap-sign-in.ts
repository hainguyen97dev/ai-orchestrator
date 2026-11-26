import { parseLdapSignInConfig, type LdapSignInConfig } from "./ldap-config";

// Kept apart from ldap-config.ts so the Vite config can import the parser
// without pulling in import.meta.env.

/** The build's LDAP sign-in configuration, or null when none is set. */
export function ldapSignInConfig(): LdapSignInConfig | null {
	return parseLdapSignInConfig(import.meta.env.VITE_AO_LDAP_URL, import.meta.env.VITE_AO_LDAP_BASE_DN);
}
