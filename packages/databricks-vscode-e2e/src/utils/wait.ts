type WaitUntilOptions = NonNullable<Parameters<typeof browser.waitUntil>[1]>;

/**
 * `browser.waitUntil` whose error ends with `seen()`, what the last try saw.
 * `timeoutMsg` is fixed when the wait starts, so it can't say that itself;
 * this lets a polling helper stay quiet instead of logging every try.
 */
export async function waitUntilSeen<T>(
    condition: () => Promise<T>,
    options: WaitUntilOptions & { timeoutMsg: string },
    seen: () => string,
) {
    try {
        return await browser.waitUntil(condition, options);
    } catch (e) {
        // When the condition threw, wdio's message has the reason, which the
        // reporter wouldn't show from `cause`.
        const reason =
            e instanceof Error && e.message !== options.timeoutMsg ? ` (${e.message})` : "";
        throw new Error(`${options.timeoutMsg}; ${seen()}${reason}`, { cause: e });
    }
}
