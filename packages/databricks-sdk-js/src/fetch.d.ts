/**
 * @param { import("node-fetch").RequestInfo} url
 * @param {import("node-fetch").RequestInit} init
 * @returns {Promise<import("node-fetch").Response>}
 */
export function fetch(
    url: import("node-fetch").RequestInfo,
    init: import("node-fetch").RequestInit
): Promise<{
    abort: () => void;
    response: Promise<import("node-fetch").Response>;
}>;
