/* eslint-disable */
require("ts-node").register({
    transpileOnly: true,
    compilerOptions: {
        module: "commonjs",
    },
});

module.exports = {
    "mutex-synchronised-decorator":
        require("./rules/mutexSynchronisedDecorator").default,
};
