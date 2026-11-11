import { describe, expect, it } from "vitest";
import {
    bundleClusterOverride,
    effectiveCompute,
    overridesFor,
    type ComputeInputs,
} from "./effectiveCompute";

describe("effectiveCompute (COMP-03)", () => {
    const cases: [string, ComputeInputs, ReturnType<typeof effectiveCompute>][] = [
        ["nothing", {}, undefined],
        [
            "the bundle's cluster",
            { bundleClusterId: "b-1" },
            { kind: "cluster", clusterId: "b-1", source: "bundle" },
        ],
        [
            "an attached cluster over the bundle's",
            { overrides: { clusterId: "o-1" }, bundleClusterId: "b-1" },
            { kind: "cluster", clusterId: "o-1", source: "override" },
        ],
        [
            "serverless by default, in a connected workspace with nothing chosen",
            { defaultServerless: true },
            { kind: "serverless", source: "default" },
        ],
        ["no default without a connection", {}, undefined],
        [
            "a cluster over the serverless default",
            { defaultServerless: true, bundleClusterId: "b-1" },
            { kind: "cluster", clusterId: "b-1", source: "bundle" },
        ],
        [
            "the profile's serverless, not the default, when both apply",
            { defaultServerless: true, serverlessComputeId: "auto" },
            { kind: "serverless", source: "profile" },
        ],
        [
            "no default over a cluster that was attached and detached (serverless off)",
            { defaultServerless: true, overrides: { serverless: false } },
            undefined,
        ],
        [
            "no default over a cluster that was chosen",
            { defaultServerless: true, overrides: { clusterId: "o-1" } },
            { kind: "cluster", clusterId: "o-1", source: "override" },
        ],
        [
            "chosen serverless over any cluster",
            { overrides: { serverless: true, clusterId: "o-1" }, bundleClusterId: "b-1" },
            { kind: "serverless", source: "override" },
        ],
        [
            "chosen serverless, with its version",
            { overrides: { serverless: true, serverlessVersion: "4" } },
            { kind: "serverless", version: "4", source: "override" },
        ],
        [
            "a stored version in the supported range is kept",
            { overrides: { serverless: true, serverlessVersion: "6" } },
            { kind: "serverless", version: "6", source: "override" },
        ],
        [
            "an unsupported stored version is dropped",
            { overrides: { serverless: true, serverlessVersion: "v4" } },
            { kind: "serverless", source: "override" },
        ],
        [
            "a version out of range is dropped",
            { overrides: { serverless: true, serverlessVersion: "9" } },
            { kind: "serverless", source: "override" },
        ],
        [
            "the profile's serverless default",
            { serverlessComputeId: "auto" },
            { kind: "serverless", source: "profile" },
        ],
        [
            "the bundle's cluster over the profile's default",
            { bundleClusterId: "b-1", serverlessComputeId: "auto" },
            { kind: "cluster", clusterId: "b-1", source: "bundle" },
        ],
        [
            "serverless turned off: no profile default",
            { overrides: { serverless: false }, serverlessComputeId: "auto" },
            undefined,
        ],
        [
            "serverless turned off, with the bundle's cluster",
            { overrides: { serverless: false }, bundleClusterId: "b-1" },
            { kind: "cluster", clusterId: "b-1", source: "bundle" },
        ],
        ["a profile value other than auto", { serverlessComputeId: "other" }, undefined],
        [
            "an empty cluster ID is no cluster",
            { overrides: { clusterId: "" }, bundleClusterId: "" },
            undefined,
        ],
    ];
    it.each(cases)("%s", (_name, inputs, expected) => {
        expect(effectiveCompute(inputs)).toEqual(expected);
    });
});

describe("overridesFor", () => {
    it("attaching a cluster turns serverless off only when it was on", () => {
        expect(overridesFor({ kind: "cluster", clusterId: "c" }, undefined)).toEqual({
            clusterId: "c",
        });
        expect(
            overridesFor(
                { kind: "cluster", clusterId: "c" },
                { kind: "cluster", clusterId: "b", source: "bundle" },
            ),
        ).toEqual({ clusterId: "c" });
        expect(
            overridesFor(
                { kind: "cluster", clusterId: "c" },
                { kind: "serverless", source: "profile" },
            ),
        ).toEqual({
            clusterId: "c",
            serverless: false,
            serverlessVersion: undefined,
        });
    });

    it("choosing serverless detaches the cluster and unchecks the override, keeping a stored version unless given one", () => {
        expect(overridesFor({ kind: "serverless" }, undefined)).toEqual({
            serverless: true,
            useClusterOverride: false,
            clusterId: undefined,
        });
        expect(overridesFor({ kind: "serverless", version: "5" }, undefined)).toEqual({
            serverless: true,
            useClusterOverride: false,
            clusterId: undefined,
            serverlessVersion: "5",
        });
    });

    it("detaching where the default would fill the target stores serverless off, so it doesn't refill on reload", () => {
        const fills = { fillsOnDetach: true };
        expect(
            overridesFor(
                { kind: "none" },
                { kind: "cluster", clusterId: "c", source: "override" },
                fills,
            ),
        ).toEqual({ clusterId: undefined, serverless: false });
        expect(overridesFor({ kind: "none" }, undefined, fills)).toEqual({
            clusterId: undefined,
            serverless: false,
        });
        expect(
            overridesFor({ kind: "none" }, { kind: "serverless", source: "default" }, fills),
        ).toEqual({ clusterId: undefined, serverless: false });
    });

    it("detaching stores nothing extra where nothing would fill the target (a bundle cluster, a session window)", () => {
        expect(
            overridesFor({ kind: "none" }, { kind: "cluster", clusterId: "c", source: "override" }),
        ).toEqual({ clusterId: undefined });
        expect(overridesFor({ kind: "none" }, undefined)).toEqual({ clusterId: undefined });
    });

    it("detaching leaves chosen or profile serverless as it is", () => {
        expect(
            overridesFor(
                { kind: "none" },
                { kind: "serverless", source: "override" },
                { fillsOnDetach: true },
            ),
        ).toEqual({ clusterId: undefined });
        expect(
            overridesFor(
                { kind: "none" },
                { kind: "serverless", source: "profile" },
                { fillsOnDetach: true },
            ),
        ).toEqual({ clusterId: undefined });
    });
});

describe("bundleClusterOverride (COMP-06)", () => {
    it("is the attached cluster while the override is checked", () => {
        expect(bundleClusterOverride({ clusterId: "c", useClusterOverride: true })).toBe("c");
        expect(bundleClusterOverride({ clusterId: "c" })).toBeUndefined();
        expect(bundleClusterOverride({ useClusterOverride: true })).toBeUndefined();
        expect(
            bundleClusterOverride({ clusterId: "c", useClusterOverride: true, serverless: true }),
        ).toBeUndefined();
        expect(bundleClusterOverride(undefined)).toBeUndefined();
    });
});
