import {NamedLogger} from "@databricks/sdk-experimental/dist/logging";
import {Loggers} from "../logger";
import {Telemetry} from "../telemetry";
import {ComputeType, SetupTrigger} from "../telemetry/constants";
import "../telemetry/packageManagerExtensions";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {ResolvedEnvironment} from "./MsPythonExtensionApi";
import {detectPackageManagers} from "./packageManagerDetection";
import {collectPackageManagerSignals} from "./packageManagerSignals";

export type {SetupTrigger};

/**
 * Collects package-manager signals at project-setup touchpoints and emits the
 * {@link Events.PYTHON_ENV_SETUP_DETECTED} telemetry event.
 *
 * All probing is best-effort and non-blocking: any failure degrades to
 * `unknown` and is swallowed, never thrown into the user's setup/run flow.
 * Only categorical/enum data is emitted — no paths, package names, or other
 * free-form content (see {@link detectPackageManagers}). Telemetry opt-out is
 * honoured by the underlying {@link Telemetry} client.
 */
export class PackageManagerTelemetry {
    private readonly logger = NamedLogger.getOrCreate(Loggers.Extension);

    /**
     * Triggers already emitted for the current `(project, trigger)` pair, to
     * deduplicate within a session so one project open doesn't inflate counts.
     */
    private readonly emitted = new Set<string>();

    constructor(
        private readonly telemetry: Telemetry,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly getProjectRoot: () => string | undefined,
        private readonly getComputeType: () => ComputeType | "none",
        private readonly isConnected: () => boolean
    ) {}

    /**
     * Detect the package manager(s) for the active project and emit telemetry.
     * Deduplicated per `(project root, trigger)` within the session. Only emits
     * while connected to a Databricks workspace, so the data describes active
     * users' projects (not extension installs that never authenticate). Never
     * throws.
     */
    async emitDetection(trigger: SetupTrigger): Promise<void> {
        try {
            // Bail before any disk access when telemetry is disabled, so an
            // opted-out user gets zero telemetry-driven file reads (not just a
            // dropped send).
            if (!this.telemetry.isTelemetryEnabled) {
                return;
            }
            const projectRoot = this.getProjectRoot();
            if (projectRoot === undefined) {
                return;
            }
            // Only report for authenticated sessions. Checked before the dedupe
            // bookkeeping so a pre-connect call doesn't consume the dedupe slot
            // and suppress the real emit once connected.
            if (!this.isConnected()) {
                return;
            }
            const dedupeKey = `${trigger}:${projectRoot}`;
            if (this.emitted.has(dedupeKey)) {
                return;
            }
            this.emitted.add(dedupeKey);

            const env = await this.resolveEnvironment();
            const signals = collectPackageManagerSignals(
                projectRoot,
                env,
                (message, e) => this.logger.debug(message, e)
            );
            const detection = detectPackageManagers(signals);

            this.telemetry.recordPackageManagerDetection(detection, {
                pythonVersion: this.getPythonMinorVersion(env),
                targetCompute: this.getComputeType(),
                trigger,
            });
        } catch (e) {
            // Detection is measurement-only and must never disrupt setup.
            this.logger.debug("Package manager detection failed", e);
        }
    }

    private async resolveEnvironment(): Promise<
        ResolvedEnvironment | undefined
    > {
        try {
            return await this.pythonExtension.pythonEnvironment;
        } catch (e) {
            this.logger.debug("Failed to resolve python environment", e);
            return undefined;
        }
    }

    /** Detected interpreter minor version (e.g. "3.11"), if available. */
    private getPythonMinorVersion(
        env: ResolvedEnvironment | undefined
    ): string | undefined {
        const version = env?.version;
        if (version?.major === undefined || version.minor === undefined) {
            return undefined;
        }
        return `${version.major}.${version.minor}`;
    }
}
