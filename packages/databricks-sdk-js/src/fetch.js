// node-fetch@3 is ESM only. Need some trickery to make it work with CommonJS
exports.fetch = async function fetch(url, init) {
    // hide `import` statement from TypeScript compiler so it doesn't mess with it
    const {default: fetch} = await eval(`import("node-fetch")`);
    const controller = new AbortController();
    const signal = controller.signal;
    return {
        abort: () => {
            controller.abort();
        },
        response: fetch(url, {signal, ...init}),
    };
};
