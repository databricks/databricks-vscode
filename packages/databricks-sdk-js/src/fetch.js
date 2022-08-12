// node-fetch@3 is ESM only. Need some trickery to make it work with CommonJS

exports.fetch = async function (url, init) {
    const {default: fetch} = await import("node-fetch");
    return await fetch(url, init);
};
