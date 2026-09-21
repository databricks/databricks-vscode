// Extends the shared root flat config and adds this package's custom
// local rule (mutex-synchronised-decorator).
import baseConfig from "../../eslint.config.mjs";
import localRules from "eslint-plugin-local-rules";

export default [
    ...baseConfig,
    {
        files: ["**/*.ts"],
        plugins: {
            "local-rules": localRules,
        },
        rules: {
            "local-rules/mutex-synchronised-decorator": "error",
        },
    },
];
