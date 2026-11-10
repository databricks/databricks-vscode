import { describe, expect, it } from "vitest";
import type { SetupCompute } from "./PythonSetupEnvironmentSetup";
import { SetupFailures } from "./SetupFailures";

const cluster = (clusterId: string, source: "override" | "bundle" = "override") =>
    ({ kind: "cluster", clusterId, source }) as const;
const serverless = (version: string) =>
    ({ kind: "serverless", version, source: "override" }) as const;

describe("SetupFailures", () => {
    it("stays on the cluster it failed on, whether the choice came from an override or a bundle", () => {
        const failures = new SetupFailures((c: SetupCompute) => JSON.stringify(c));
        failures.markFailed("/proj", failures.keyFor({ kind: "cluster", clusterId: "c-1" }));
        expect(failures.matches("/proj", cluster("c-1", "bundle"))).toBe(true);
        expect(failures.matches("/proj", cluster("c-1"))).toBe(true);
        expect(failures.matches("/proj", cluster("c-2"))).toBe(false);
    });

    it("stays on the serverless version it failed on", () => {
        const failures = new SetupFailures((c: SetupCompute) => JSON.stringify(c));
        failures.markFailed("/proj", failures.keyFor({ kind: "serverless", version: "4" }));
        expect(failures.matches("/proj", serverless("4"))).toBe(true);
        expect(failures.matches("/proj", serverless("5"))).toBe(false);
    });

    it("stops matching when what the checklist reads changes, and clears on the next change", () => {
        let dbr = "15.4";
        const failures = new SetupFailures((c: SetupCompute) => JSON.stringify([c, dbr]));
        failures.markFailed("/proj", failures.keyFor({ kind: "cluster", clusterId: "c-1" }));
        expect(failures.matches("/proj", cluster("c-1"))).toBe(true);
        dbr = "16.0";
        expect(failures.matches("/proj", cluster("c-1"))).toBe(false);
        failures.clearUnless("/proj", cluster("c-1"));
        dbr = "15.4";
        expect(failures.matches("/proj", cluster("c-1"))).toBe(false);
    });

    it("keeps a failure while the compute in use still matches it", () => {
        const failures = new SetupFailures((c: SetupCompute) => JSON.stringify(c));
        failures.markFailed("/proj", failures.keyFor({ kind: "cluster", clusterId: "c-1" }));
        failures.clearUnless("/proj", cluster("c-1"));
        expect(failures.matches("/proj", cluster("c-1"))).toBe(true);
    });

    it("forgets a project's failure on a successful setup", () => {
        const failures = new SetupFailures((c: SetupCompute) => JSON.stringify(c));
        failures.markFailed("/proj", failures.keyFor({ kind: "cluster", clusterId: "c-1" }));
        failures.clear("/proj");
        expect(failures.matches("/proj", cluster("c-1"))).toBe(false);
    });
});
