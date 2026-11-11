import { TelemetryReporter as VsCodeTelemetryReporter } from "@vscode/extension-telemetry";
import type { ExtensionMode } from "./definitions";
import { contextMetadata, isDevExtension } from "./environment";
import { Telemetry } from "./Telemetry";

export * from "./definitions";
export * from "./Telemetry";
export * from "./events";
export * from "./environment";
export { toUserMetadata } from "./userMetadata";

/** Application Insights keys, as in the old extension. */
const PROD_APP_INSIGHTS_CONFIGURATION_KEY = "ebe191c5-f06b-4189-b68c-34fb5fbdb3f0";
const DEV_APP_INSIGHTS_CONFIGURATION_KEY = "257d1561-5005-4a76-a3a8-7955df129e86";

/** A telemetry service that never breaks activation: no reporter, no events. */
export function createTelemetry(mode: ExtensionMode): Telemetry {
    let reporter: VsCodeTelemetryReporter | undefined;
    try {
        reporter = new VsCodeTelemetryReporter(
            isDevExtension()
                ? DEV_APP_INSIGHTS_CONFIGURATION_KEY
                : PROD_APP_INSIGHTS_CONFIGURATION_KEY,
        );
    } catch {
        reporter = undefined;
    }
    const telemetry = new Telemetry(reporter);
    telemetry.setMetadata("context", contextMetadata(mode));
    return telemetry;
}
