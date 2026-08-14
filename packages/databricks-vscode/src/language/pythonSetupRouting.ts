/**
 * The slice of the uv-native setup flow ({@link
 * ../python-setup/controllers/PythonSetupEnvironmentSetup}) that the setup
 * command router needs. Kept as a narrow structural interface so the router
 * carries no dependency on the controller/gateway layers and stays
 * unit-testable.
 */
export interface UvPythonSetup {
    /** Whether the uv-native flow is the active surface for the current project. */
    isVisible(): Promise<boolean>;
    /** Run the uv-native setup (re-entrancy-guarded); resolves when it settles. */
    setup(): Promise<void>;
}

/** The legacy checklist setup, as the router invokes it. */
export interface LegacyEnvironmentSetup {
    setup(stepId?: string): Promise<void>;
}

/**
 * Back the `databricks.environment.setup` command: run the uv-native flow when
 * it is the active surface for the current project, otherwise the legacy
 * checklist. Routing here means every surface that funnels through that command
 * (status bar, config-view rows, palette, the run/debug gate) reaches the right
 * flow without per-surface branching. `stepId` is a legacy-only affordance and
 * is ignored by the uv flow, which has no per-step entry points.
 */
export async function routeEnvironmentSetup(
    uv: UvPythonSetup,
    legacy: LegacyEnvironmentSetup,
    stepId?: string
): Promise<void> {
    if (await uv.isVisible()) {
        await uv.setup();
        return;
    }
    await legacy.setup(stepId);
}
