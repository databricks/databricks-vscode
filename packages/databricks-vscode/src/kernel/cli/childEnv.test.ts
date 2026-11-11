import { describe, expect, it } from "vitest";
import { childEnv, proxyVariables } from "./childEnv";

const base = {
    HOME: "/home/me",
    PATH: "/usr/bin",
    DATABRICKS_LOCALENV_AUTO_INSTALL_UV: "1",
    UNDEFINED_VAR: undefined,
};
const common = { configFile: "/home/me/.databrickscfg", cliPath: "/ext/bin/databricks" };

describe("childEnv", () => {
    it("PAT profile: the profile, the host and the config file", () => {
        expect(
            childEnv({
                ...common,
                base,
                connection: {
                    kind: "profile",
                    host: "https://a.cloud.databricks.com",
                    profile: "DEFAULT",
                    authType: "pat",
                },
            }),
        ).toEqual({
            HOME: "/home/me",
            PATH: "/usr/bin",
            DATABRICKS_LOCALENV_AUTO_INSTALL_UV: "1",
            DATABRICKS_CONFIG_FILE: "/home/me/.databrickscfg",
            DATABRICKS_HOST: "https://a.cloud.databricks.com",
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
        });
    });

    it("M2M profile: the same, with no secret in the environment", () => {
        const env = childEnv({
            ...common,
            base: {
                ...base,
                DATABRICKS_CLIENT_ID: "ambient",
                DATABRICKS_CLIENT_SECRET: "ambient-secret",
            },
            connection: {
                kind: "profile",
                host: "https://a.cloud.databricks.com",
                profile: "sp",
                authType: "oauth-m2m",
            },
        });
        expect(env).toEqual({
            HOME: "/home/me",
            PATH: "/usr/bin",
            DATABRICKS_LOCALENV_AUTO_INSTALL_UV: "1",
            DATABRICKS_CONFIG_FILE: "/home/me/.databrickscfg",
            DATABRICKS_HOST: "https://a.cloud.databricks.com",
            DATABRICKS_CONFIG_PROFILE: "sp",
        });
    });

    it("U2M profile: adds the bundled CLI, so Python SDKs can mint tokens", () => {
        expect(
            childEnv({
                ...common,
                base: { PATH: "/usr/bin" },
                connection: {
                    kind: "profile",
                    host: "https://a.cloud.databricks.com",
                    profile: "dev",
                    authType: "databricks-cli",
                },
            }),
        ).toEqual({
            PATH: "/usr/bin",
            DATABRICKS_CONFIG_FILE: "/home/me/.databrickscfg",
            DATABRICKS_HOST: "https://a.cloud.databricks.com",
            DATABRICKS_CONFIG_PROFILE: "dev",
            DATABRICKS_CLI_PATH: "/ext/bin/databricks",
        });
    });

    it("removes an ambient DATABRICKS_TOKEN and other auth variables", () => {
        const env = childEnv({
            ...common,
            base: {
                DATABRICKS_TOKEN: "dapi-ambient",
                DATABRICKS_AUTH_TYPE: "pat",
                DATABRICKS_CONFIG_PROFILE: "other",
            },
            connection: { kind: "profile", host: "https://h", profile: "DEFAULT", authType: "pat" },
        });
        expect(env.DATABRICKS_TOKEN).toBeUndefined();
        expect(env.DATABRICKS_AUTH_TYPE).toBeUndefined();
        expect(env.DATABRICKS_CONFIG_PROFILE).toBe("DEFAULT");
    });

    it("removes the SDKs' Azure, Google and OIDC credentials, which make a PAT profile's CLI calls fail", () => {
        // The CLI reads these too. With a PAT profile, ARM_CLIENT_SECRET fails every call with
        // "validate: more than one authorization method configured: azure and pat".
        const ambient = {
            ARM_CLIENT_ID: "sp-id",
            ARM_CLIENT_SECRET: "sp-secret",
            ARM_TENANT_ID: "tenant",
            ARM_USE_MSI: "true",
            GOOGLE_CREDENTIALS: "{}",
            DATABRICKS_OIDC_TOKEN_FILEPATH: "/var/run/oidc-token",
        };
        expect(
            childEnv({
                ...common,
                base: { PATH: "/usr/bin", ...ambient },
                connection: {
                    kind: "profile",
                    host: "https://h",
                    profile: "DEFAULT",
                    authType: "pat",
                },
            }),
        ).toEqual({
            PATH: "/usr/bin",
            DATABRICKS_CONFIG_FILE: "/home/me/.databrickscfg",
            DATABRICKS_HOST: "https://h",
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
        });
        // A session keeps them: its credentials come from the environment.
        expect(
            childEnv({
                ...common,
                base: ambient,
                connection: {
                    kind: "session",
                    host: "https://h",
                    authType: "azure-client-secret",
                },
            }),
        ).toMatchObject(ambient);
    });

    it("removes ambient auth variables when signed out, too", () => {
        const env = childEnv({
            ...common,
            base: { DATABRICKS_TOKEN: "dapi-ambient", DATABRICKS_HOST: "https://x" },
        });
        expect(env).toEqual({ DATABRICKS_CONFIG_FILE: "/home/me/.databrickscfg" });
    });

    it("a session: passes its credentials through, but not its compute, and no profile", () => {
        expect(
            childEnv({
                ...common,
                configFile: "/storage/no-config-file",
                base: {
                    DATABRICKS_HOST: "https://r",
                    DATABRICKS_TOKEN: "dapi-remote",
                    DATABRICKS_REMOTE_ENV: "1",
                    DATABRICKS_CLUSTER_ID: "1019-session",
                    DATABRICKS_SERVERLESS_COMPUTE_ID: "auto",
                    DATABRICKS_CONFIG_PROFILE: "DEFAULT",
                },
                connection: { kind: "session", host: "https://r", authType: "pat" },
            }),
        ).toEqual({
            DATABRICKS_HOST: "https://r",
            DATABRICKS_TOKEN: "dapi-remote",
            DATABRICKS_REMOTE_ENV: "1",
            DATABRICKS_CONFIG_FILE: "/storage/no-config-file",
        });
    });

    it("a session's bundle calls: the project root is pinned, and compute only when asked for", () => {
        const env = childEnv({
            ...common,
            base: { DATABRICKS_TOKEN: "t", DATABRICKS_CLUSTER_ID: "1019-session" },
            connection: { kind: "session", host: "https://r", authType: "pat" },
            bundleRoot: "/Workspace/Users/me/project",
            compute: { kind: "cluster", clusterId: "c-jobs" },
        });
        expect(env).toMatchObject({
            DATABRICKS_BUNDLE_ROOT: "/Workspace/Users/me/project",
            DATABRICKS_CLUSTER_ID: "c-jobs",
        });
        // A profile connection's root is the CLI's to find, as before.
        expect(
            childEnv({
                ...common,
                base: {},
                connection: { kind: "profile", host: "https://h", profile: "P", authType: "pat" },
                bundleRoot: "/project",
            }),
        ).not.toHaveProperty("DATABRICKS_BUNDLE_ROOT");
    });

    it("adds the CLI variables for CLI calls", () => {
        expect(childEnv({ ...common, base: {}, cli: { extensionVersion: "2.20.0" } })).toEqual({
            DATABRICKS_CONFIG_FILE: "/home/me/.databrickscfg",
            DATABRICKS_OUTPUT_FORMAT: "json",
            DATABRICKS_CLI_UPSTREAM: "databricks-vscode",
            DATABRICKS_CLI_UPSTREAM_VERSION: "2.20.0",
        });
    });

    it("bundle CLI calls: one BUNDLE_VAR_<name> per override, over the environment's", () => {
        expect(
            childEnv({
                ...common,
                base: { BUNDLE_VAR_region: "ambient", BUNDLE_VAR_other: "kept" },
                connection: {
                    kind: "profile",
                    host: "https://a.cloud.databricks.com",
                    profile: "DEFAULT",
                    authType: "pat",
                },
                cli: { extensionVersion: "2.20.0" },
                bundleVariables: { region: "eu", varWithDefault: "new value" },
            }),
        ).toEqual({
            BUNDLE_VAR_other: "kept",
            BUNDLE_VAR_region: "eu",
            BUNDLE_VAR_varWithDefault: "new value",
            DATABRICKS_CONFIG_FILE: "/home/me/.databrickscfg",
            DATABRICKS_HOST: "https://a.cloud.databricks.com",
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            DATABRICKS_OUTPUT_FORMAT: "json",
            DATABRICKS_CLI_UPSTREAM: "databricks-vscode",
            DATABRICKS_CLI_UPSTREAM_VERSION: "2.20.0",
        });
    });

    const pat = {
        kind: "profile",
        host: "https://a.cloud.databricks.com",
        profile: "DEFAULT",
        authType: "pat",
    } as const;

    it("compute: DATABRICKS_CLUSTER_ID, or DATABRICKS_SERVERLESS_COMPUTE_ID=auto", () => {
        expect(
            childEnv({
                ...common,
                base: {},
                connection: pat,
                compute: { kind: "cluster", clusterId: "c-1" },
            }),
        ).toMatchObject({ DATABRICKS_CLUSTER_ID: "c-1" });
        const env = childEnv({
            ...common,
            base: {},
            connection: pat,
            compute: { kind: "serverless" },
        });
        expect(env.DATABRICKS_SERVERLESS_COMPUTE_ID).toBe("auto");
        expect(env).not.toHaveProperty("DATABRICKS_CLUSTER_ID");
    });

    it("removes ambient compute variables for every connection: a session's are the window's compute", () => {
        const ambient = {
            DATABRICKS_CLUSTER_ID: "ambient",
            DATABRICKS_SERVERLESS_COMPUTE_ID: "auto",
        };
        const session = {
            kind: "session",
            host: "https://a.cloud.databricks.com",
            authType: "pat",
        } as const;
        for (const connection of [pat, session]) {
            const env = childEnv({ ...common, base: ambient, connection });
            expect(env).not.toHaveProperty("DATABRICKS_CLUSTER_ID");
            expect(env).not.toHaveProperty("DATABRICKS_SERVERLESS_COMPUTE_ID");
        }
    });
});

describe("proxyVariables", () => {
    it("reads lower-case environment variables", () => {
        expect(
            proxyVariables({
                http_proxy: "http://p",
                https_proxy: "https://p",
                no_proxy: "example.com",
            }),
        ).toEqual({ HTTP_PROXY: "http://p", HTTPS_PROXY: "https://p", NO_PROXY: "example.com" });
    });

    it("reads upper-case environment variables", () => {
        expect(
            proxyVariables({
                HTTP_PROXY: "http://p",
                HTTPS_PROXY: "https://p",
                NO_PROXY: "example.com",
            }),
        ).toEqual({
            HTTP_PROXY: "http://p",
            HTTPS_PROXY: "https://p",
            NO_PROXY: "example.com",
        });
    });

    it("uses the http.proxy setting for both schemes, over the environment", () => {
        expect(
            proxyVariables({ HTTP_PROXY: "http://env:1" }, { httpProxy: "http://setting:2" }),
        ).toEqual({
            HTTP_PROXY: "http://setting:2",
            HTTPS_PROXY: "http://setting:2",
        });
    });

    it("merges http.noProxy with NO_PROXY, without duplicates", () => {
        expect(
            proxyVariables(
                { NO_PROXY: "shared.example.com,env.example.com" },
                { noProxy: ["setting.example.com", "shared.example.com"] },
            ),
        ).toEqual({ NO_PROXY: "setting.example.com,shared.example.com,env.example.com" });
    });

    it("sets nothing when no proxy is configured", () => {
        expect(proxyVariables({})).toEqual({});
    });
});

describe("certificate and proxy variables, by environment", () => {
    // A host env that sets every certificate and proxy variable.
    const host = {
        HOME: "/home/me",
        PATH: "/usr/bin",
        SSL_CERT_FILE: "/corp/bundle.pem",
        SSL_CERT_DIR: "/corp/certs",
        HTTP_PROXY: "http://env-http:1",
        HTTPS_PROXY: "http://env-https:2",
        NO_PROXY: "env.example.com",
        http_proxy: "http://lower-http:3",
        https_proxy: "http://lower-https:4",
        no_proxy: "lower.example.com",
    };
    const settings = { httpProxy: "http://setting:8080", noProxy: ["setting.example.com"] };
    const CERT_AND_PROXY = [
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "no_proxy",
    ] as const;
    const pick = (env: Record<string, string>) =>
        Object.fromEntries(CERT_AND_PROXY.filter((k) => k in env).map((k) => [k, env[k]]));
    const profile = {
        kind: "profile",
        host: "https://a.cloud.databricks.com",
        profile: "DEFAULT",
        authType: "databricks-cli",
    } as const;
    const run = (
        environment: "cli" | "inherited" | "hostAndProxy",
        proxy: { httpProxy?: string; noProxy?: string[] } = settings,
    ) =>
        childEnv({
            ...common,
            base: host,
            connection: profile,
            proxy,
            environment,
            cli: { extensionVersion: "2.22.0" },
        });

    it("cli, with http.proxy: no certificate variables and no lower-case names; the setting's proxy", () => {
        expect(pick(run("cli"))).toEqual({
            HTTP_PROXY: "http://setting:8080",
            HTTPS_PROXY: "http://setting:8080",
            NO_PROXY: "setting.example.com,env.example.com",
        });
    });

    it("cli, without http.proxy: the environment's proxy, uppercase only", () => {
        expect(pick(run("cli", {}))).toEqual({
            HTTP_PROXY: "http://env-http:1",
            HTTPS_PROXY: "http://env-https:2",
            NO_PROXY: "env.example.com",
        });
    });

    it("inherited, with http.proxy: the host env as it is, with no http.proxy", () => {
        expect(pick(run("inherited"))).toEqual(pick(host));
        expect(run("inherited").HTTP_PROXY).toBe("http://env-http:1");
    });

    it("inherited, without http.proxy: the host env as it is", () => {
        expect(pick(run("inherited", {}))).toEqual(pick(host));
    });

    it("hostAndProxy, with http.proxy: the host env, certificates kept, the setting's proxy over it", () => {
        expect(pick(run("hostAndProxy"))).toEqual({
            SSL_CERT_FILE: "/corp/bundle.pem",
            SSL_CERT_DIR: "/corp/certs",
            HTTP_PROXY: "http://setting:8080",
            HTTPS_PROXY: "http://setting:8080",
            NO_PROXY: "setting.example.com,env.example.com",
            http_proxy: "http://lower-http:3",
            https_proxy: "http://lower-https:4",
            no_proxy: "lower.example.com",
        });
    });

    it("hostAndProxy, without http.proxy: the host env's own proxy values, certificates kept", () => {
        expect(pick(run("hostAndProxy", {}))).toEqual({
            ...pick(host),
            HTTP_PROXY: "http://env-http:1",
            HTTPS_PROXY: "http://env-https:2",
            NO_PROXY: "env.example.com",
        });
    });

    it("a CLI call defaults to cli; any other call defaults to hostAndProxy", () => {
        const cliDefault = childEnv({
            ...common,
            base: host,
            connection: profile,
            proxy: settings,
            cli: { extensionVersion: "2.22.0" },
        });
        expect(cliDefault).not.toHaveProperty("SSL_CERT_FILE");
        const other = childEnv({ ...common, base: host, connection: profile, proxy: settings });
        expect(other.SSL_CERT_FILE).toBe("/corp/bundle.pem");
        expect(other.HTTP_PROXY).toBe("http://setting:8080");
    });

    it.each(["cli", "inherited", "hostAndProxy"] as const)(
        "%s: the extension's config file still reaches the child",
        (environment) => {
            expect(run(environment).DATABRICKS_CONFIG_FILE).toBe("/home/me/.databrickscfg");
        },
    );

    it.each(["cli", "inherited", "hostAndProxy"] as const)(
        "%s: every other host variable passes through",
        (environment) => {
            expect(run(environment)).toMatchObject({ PATH: "/usr/bin", HOME: "/home/me" });
        },
    );
});
