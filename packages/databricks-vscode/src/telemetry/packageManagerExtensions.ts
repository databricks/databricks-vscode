import {Events, Telemetry} from ".";
import {
    PackageManagerName,
    InterpreterSource,
    TargetCompute,
    SetupTrigger,
} from "./constants";
import {PackageManagerDetection} from "../language/packageManagerDetection";

/**
 * Context for a package-manager detection that is not part of the detection
 * result itself: the interpreter version, the targeted compute, and what
 * triggered the emission.
 */
export interface PackageManagerDetectionContext {
    pythonVersion?: string;
    targetCompute: TargetCompute;
    trigger: SetupTrigger;
}

declare module "." {
    interface Telemetry {
        /**
         * Record a package-manager detection as a PYTHON_ENV_SETUP_DETECTED
         * event. This is the emit half only: callers gather the signals and run
         * the pure {@link detectPackageManagers} classifier, then hand the
         * result here. Keeping the collection out of Telemetry keeps this client
         * free of disk/Python-extension dependencies.
         */
        recordPackageManagerDetection(
            detection: PackageManagerDetection,
            context: PackageManagerDetectionContext
        ): void;
    }
}

Telemetry.prototype.recordPackageManagerDetection = function (
    detection: PackageManagerDetection,
    context: PackageManagerDetectionContext
) {
    this.recordEvent(Events.PYTHON_ENV_SETUP_DETECTED, {
        managersDetected: detection.managers as PackageManagerName[],
        primaryManager: detection.primary,
        signals: detection.signals,
        pythonVersion: context.pythonVersion,
        interpreterSource: detection.interpreterSource as InterpreterSource,
        hasLockfile: detection.hasLockfile,
        targetCompute: context.targetCompute,
        setupTrigger: context.trigger,
    });
};
