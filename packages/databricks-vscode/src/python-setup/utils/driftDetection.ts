/**
 * Whether the local environment has drifted: both the last-provisioned key
 * (`persistedEnvKey`) and the selected compute's key (`currentEnvKey`) are known
 * and differ. Anything unknown is deliberately NOT drift — never a false alarm.
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
