import { describe, expect, it } from "vitest";
import { includePatterns, localBundleConfig, mergeBundleDocuments } from "./LocalBundleConfig";
import { parseBundleYaml } from "./BundleFiles";

const config = (...yamls: string[]) => localBundleConfig(yamls.map(parseBundleYaml));

describe("localBundleConfig", () => {
    it("reads one target with its host", () => {
        expect(
            config(`
bundle: {name: demo}
targets:
  dev:
    workspace: {host: https://a.cloud.databricks.com}
`),
        ).toEqual({
            name: "demo",
            variables: {},
            targets: [
                {
                    name: "dev",
                    host: "https://a.cloud.databricks.com",
                    profile: undefined,
                    mode: undefined,
                    default: false,
                },
            ],
            defaultTarget: undefined,
        });
    });

    it("reads the top-level variable definitions, in both forms", () => {
        expect(
            config(`
variables:
  warehouse: {description: The warehouse, default: small}
  short: main
  cluster: {type: complex, default: {num_workers: 1}}
  required: {description: No default}
`).variables,
        ).toEqual({
            warehouse: { description: "The warehouse", type: undefined, default: "small" },
            short: { description: undefined, type: undefined, default: "main" },
            cluster: { description: undefined, type: "complex", default: { num_workers: 1 } },
            required: { description: "No default", type: undefined, default: undefined },
        });
    });

    it("keeps the declared order of several targets, and finds the default", () => {
        const c = config(`
targets:
  dev: {mode: development, default: true}
  staging: {mode: staging}
  prod: {mode: production}
`);
        expect(c.targets.map((t) => [t.name, t.mode, t.default])).toEqual([
            ["dev", "development", true],
            ["staging", "staging", false],
            ["prod", "production", false],
        ]);
        expect(c.defaultTarget).toBe("dev");
    });

    it("ignores an unknown mode, and a default that isn't literally true", () => {
        const c = config(`
targets:
  dev: {mode: sandbox, default: "true"}
`);
        expect(c.targets[0]).toMatchObject({ mode: undefined, default: false });
        expect(c.defaultTarget).toBeUndefined();
    });

    it("merges the top-level workspace into each target's, the target winning", () => {
        const c = config(`
workspace:
  host: https://top.cloud.databricks.com
  profile: TOP
targets:
  inherits:
  overrides:
    workspace: {profile: OWN}
`);
        expect(c.targets.map((t) => [t.name, t.host, t.profile])).toEqual([
            ["inherits", "https://top.cloud.databricks.com", "TOP"],
            ["overrides", "https://top.cloud.databricks.com", "OWN"],
        ]);
    });

    it("reads workspace.profile without a host", () => {
        expect(
            config(`targets: {dev: {workspace: {profile: dev-profile}}}`).targets[0],
        ).toMatchObject({
            host: undefined,
            profile: "dev-profile",
        });
    });

    it("merges included files over the root, later files winning", () => {
        const c = config(
            `targets: {dev: {workspace: {host: https://root.cloud.databricks.com}}}`,
            `targets: {dev: {mode: development}, extra: {}}`,
            `targets: {dev: {workspace: {host: https://later.cloud.databricks.com}}}`,
        );
        expect(c.targets.map((t) => [t.name, t.host, t.mode])).toEqual([
            ["dev", "https://later.cloud.databricks.com", "development"],
            ["extra", undefined, undefined],
        ]);
    });

    it("has no targets for an empty or scalar document", () => {
        expect(localBundleConfig([undefined]).targets).toEqual([]);
        expect(localBundleConfig(["just a string"]).targets).toEqual([]);
        expect(localBundleConfig([{ targets: ["not", "a", "map"] }]).targets).toEqual([]);
    });
});

describe("mergeBundleDocuments", () => {
    it("replaces arrays instead of merging them by index", () => {
        expect(mergeBundleDocuments([{ include: ["a", "b"] }, { include: ["c"] }])).toEqual({
            include: ["c"],
        });
    });

    it("doesn't modify its inputs", () => {
        const root = { targets: { dev: { mode: "development" } } };
        mergeBundleDocuments([root, { targets: { dev: { default: true } } }]);
        expect(root).toEqual({ targets: { dev: { mode: "development" } } });
    });
});

describe("includePatterns", () => {
    it("keeps only non-empty strings", () => {
        expect(
            includePatterns({ include: ["resources/*.yml", "", 3, null, "../shared/*.yml"] }),
        ).toEqual(["resources/*.yml", "../shared/*.yml"]);
        expect(includePatterns({ include: "resources/*.yml" })).toEqual([]);
        expect(includePatterns(undefined)).toEqual([]);
    });
});
