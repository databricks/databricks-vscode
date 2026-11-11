import {
    detectPackageManagers,
    type PackageManagerDetection,
    type PackageManagerSignals,
} from "./packageManagerDetection";

/**
 * Gathers the package-manager signals for a project root. Injected so the
 * detector's classification wiring is unit-testable without disk access or the
 * MS Python extension; `PythonEnvironment` wires a real collector that
 * resolves the active interpreter and calls `collectPackageManagerSignals`.
 */
export type SignalCollector = (projectRoot: string) => Promise<PackageManagerSignals>;

/**
 * Live package-manager detection for the setup strategy (uv or external).
 *
 * Thin async shell over the pure {@link detectPackageManagers}: it collects the
 * project's signals via the injected {@link SignalCollector} and classifies
 * them. Detection is best-effort and must
 * never disrupt the setup/config-view flow, so any collection failure degrades
 * to `unknown`/`[]` (which the gate reads as "greenfield" — safe to offer).
 */
export class PythonSetupManagerDetector {
    constructor(private readonly collect: SignalCollector) {}

    async detect(projectRoot: string): Promise<PackageManagerDetection> {
        try {
            // The whole detection: the gate reads `signals` too, to tell a real
            // pip workflow from a merely packaging-shaped pyproject.toml, which
            // the manager list alone cannot express (both read as "pip"); the
            // telemetry event reads the rest.
            return detectPackageManagers(await this.collect(projectRoot));
        } catch {
            return detectPackageManagers({});
        }
    }
}
