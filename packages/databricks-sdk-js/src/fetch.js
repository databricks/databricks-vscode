// node-fetch@3 is ESM only. Need some trickery to make it work with CommonJS

exports.fetch = async function (url, init) {
    const {default: fetch} = await import("node-fetch");
    const controller = new AbortController();
    const signal = controller.signal;
    return {
        abort: () => {
            controller.abort();
        },
        response: fetch(url, {signal, ...init}),
    };
};
