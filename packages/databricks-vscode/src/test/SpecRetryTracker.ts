// Lives under `src/test/` (not `src/test/e2e/`) for the same reason as
// retry.ts: the e2e folder is excluded from the unit build, so a colocated unit
// test only runs when the module sits outside it. The e2e config imports it via
// an explicit `.ts` extension.

// Tracks e2e spec outcomes across wdio's spec-file retries so a spec that only
// passes on a retry — an otherwise-silent flake, since wdio reports the run as
// green — can be surfaced at the end. `record` is called once per worker-end
// (i.e. per attempt); `recoveredSpecs` lists specs that failed at least one
// attempt but later passed. A spec that fails every attempt is a hard failure
// wdio already reports, so it is deliberately not listed here.
export class SpecRetryTracker {
    private readonly failed = new Set<string>();
    private readonly recovered = new Set<string>();

    record(spec: string, passed: boolean): void {
        if (!passed) {
            this.failed.add(spec);
            this.recovered.delete(spec);
            return;
        }
        if (this.failed.has(spec)) {
            this.recovered.add(spec);
        }
    }

    get recoveredSpecs(): string[] {
        return [...this.recovered];
    }
}
