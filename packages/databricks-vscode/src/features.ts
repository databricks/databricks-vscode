import type { Feature } from "./kernel/feature";
import { aiTools } from "./features/ai-tools";
import { bundleExplorer } from "./features/bundle-explorer";
import { bundleInit } from "./features/bundle-init";
import { bundleVariables } from "./features/bundle-variables";
import { bundleYaml } from "./features/bundle-yaml";
import { compute } from "./features/compute";
import { configurationView } from "./features/configuration-view";
import { connection } from "./features/connection";
import { logs } from "./features/logs";
import { onboarding } from "./features/onboarding";
import { project } from "./features/project";
import { python } from "./features/python";
import { run } from "./features/run";
import { ssh } from "./features/ssh";
import { sync } from "./features/sync";
import { terminalEnv } from "./features/terminal-env";
import { treeCommands } from "./features/tree-commands";
import { unityCatalog } from "./features/unity-catalog";
import { unityGateway } from "./features/unity-gateway";
import { unityGatewayChat } from "./features/unity-gateway-chat";
import { workspaceFiles } from "./features/workspace-files";

/** Every feature, in registration order. Adding a feature adds a line here. */
export const FEATURES: readonly Feature[] = [
    configurationView,
    project,
    connection,
    unityGateway,
    unityGatewayChat,
    bundleExplorer,
    bundleVariables,
    bundleInit,
    bundleYaml,
    sync,
    compute,
    run,
    python,
    workspaceFiles,
    unityCatalog,
    ssh,
    aiTools,
    terminalEnv,
    treeCommands,
    onboarding,
    logs,
];
