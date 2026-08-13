/**
 * Decide whether the local environment has drifted from the selected compute.
 *
 * Drift means we know both the environment key we last provisioned against
 * (`persistedEnvKey`, from `databricks.pythonSetup.setupState`) and the key the
 * currently selected compute would resolve to (`currentEnvKey`), and they
 * differ. Anything unknown — no prior setup, or a compute whose key could not be
 * resolved — is deliberately NOT drift: absence of a clear signal must never
 * raise a false alarm (see the design's fail-safe rule).
 */
export function isDrifted(
    persistedEnvKey: string | undefined,
    currentEnvKey: string | undefined
): boolean {
    return (
        persistedEnvKey !== undefined &&
        currentEnvKey !== undefined &&
        persistedEnvKey !== currentEnvKey
    );
}
