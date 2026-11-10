import type { Disposable, Event } from "vscode";
import { Emitter } from "../../../../platform/event";
import type { Compute } from "../../../../kernel/compute/effectiveCompute";
import type { SetupCompute } from "./PythonSetupEnvironmentSetup";

/**
 * The uv setups that failed in this window, by project. A failure is keyed by
 * the compute its run used and what the checklist read from it, and it stays
 * red only while the compute in use has the same key. In memory only: a
 * reload forgets it.
 */
export class SetupFailures implements Disposable {
    private readonly keys = new Map<string, string>();
    private readonly emitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.emitter.event;

    /** @param keyOf the key of a compute, read at the time it is given. */
    constructor(private readonly keyOf: (compute: SetupCompute) => string) {}

    /** The key for a run on `compute`, taken when the run starts. */
    keyFor(compute: SetupCompute): string {
        return this.keyOf(identityOf(compute));
    }

    markFailed(root: string, key: string): void {
        if (this.keys.get(root) !== key) {
            this.keys.set(root, key);
            this.emitter.fire();
        }
    }

    /** Whether the project's last failure was on the compute in use now. */
    matches(root: string, effective: Compute | undefined): boolean {
        const key = effective === undefined ? undefined : this.keyOfEffective(effective);
        return key !== undefined && this.keys.get(root) === key;
    }

    /** Forgets a failure that the compute in use no longer matches. */
    clearUnless(root: string, effective: Compute | undefined): void {
        if (!this.matches(root, effective)) {
            this.clear(root);
        }
    }

    /** A successful setup. */
    clear(root: string): void {
        if (this.keys.delete(root)) {
            this.emitter.fire();
        }
    }

    dispose(): void {
        this.emitter.dispose();
    }

    private keyOfEffective(effective: Compute): string | undefined {
        if (effective.kind === "cluster") {
            return this.keyFor({ kind: "cluster", clusterId: effective.clusterId });
        }
        if (effective.version !== undefined) {
            return this.keyFor({ kind: "serverless", version: effective.version });
        }
        return undefined;
    }
}

/** What identifies the compute, and nothing else of a run's compute record. */
function identityOf(compute: SetupCompute): SetupCompute {
    return compute.kind === "cluster"
        ? { kind: "cluster", clusterId: compute.clusterId }
        : { kind: "serverless", version: compute.version };
}
