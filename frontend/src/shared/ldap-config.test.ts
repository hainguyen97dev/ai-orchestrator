import { describe, expect, it } from "vitest";
import { parseLdapSignInConfig } from "./ldap-config";

describe("parseLdapSignInConfig", () => {
	it("is null when unset or blank", () => {
		expect(parseLdapSignInConfig(undefined)).toBeNull();
		expect(parseLdapSignInConfig("  ")).toBeNull();
	});
	it("accepts ldap:// and ldaps:// with an optional base DN", () => {
		expect(parseLdapSignInConfig("ldaps://ldap.example.com:636", " ou=people,dc=example,dc=com ")).toEqual({
			url: "ldaps://ldap.example.com:636",
			baseDn: "ou=people,dc=example,dc=com",
		});
		expect(parseLdapSignInConfig("ldap://10.0.0.5")).toEqual({ url: "ldap://10.0.0.5" });
	});
	it("rejects other schemes and embedded credentials", () => {
		expect(() => parseLdapSignInConfig("https://ldap.example.com")).toThrow(/ldap:\/\/ or ldaps:\/\//);
		expect(() => parseLdapSignInConfig("not a url")).toThrow(/ldap:\/\/ or ldaps:\/\//);
		expect(() => parseLdapSignInConfig("ldaps://admin:secret@ldap.example.com")).toThrow(/credentials/);
	});
});
