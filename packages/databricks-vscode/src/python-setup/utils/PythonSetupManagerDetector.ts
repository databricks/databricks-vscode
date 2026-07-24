import {
    detectPackageManagers,
    PackageManagerDetection,
    PackageManagerSignals,
} from "../../language/packageManagerDetection";

/**
 * Gathers the package-manager signals for a project root. Injected so the
 * detector's classification wiring is unit-testable without disk access or the
 * MS Python extension; the extension wires a real collector that resolves the
 * active interpreter and calls `collectPackageManagerSignals`.
 */
export type SignalCollector = (
    projectRoot: string
) => Promise<PackageManagerSignals>;

/**
 * Live package-manager detection for the python-setup visibility gate.
 *
 * Thin async shell over the pure {@link detectPackageManagers}: it collects the
 * project's signals via the injected {@link SignalCollector}, classifies them,
 * and returns only the fields the gate needs. Detection is best-effort and must
 * never disrupt the setup/config-view flow, so any collection failure degrades
 * to `unknown`/`[]` (which the gate reads as "greenfield" — safe to offer).
 */
export class PythonSetupManagerDetector {
    constructor(private readonly collect: SignalCollector) {}

    async detect(
        projectRoot: string
    ): Promise<Pick<PackageManagerDetection, "primary" | "managers">> {
        try {
            const signals = await this.collect(projectRoot);
            const {primary, managers} = detectPackageManagers(signals);
            return {primary, managers};
        } catch {
            return {primary: "unknown", managers: []};
        }
    }
}
