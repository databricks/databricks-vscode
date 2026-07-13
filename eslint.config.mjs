// Flat config (ESLint 9+). Shared base for all workspaces; individual
// packages import and extend this via their own eslint.config.mjs.
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import noOnlyTests from "eslint-plugin-no-only-tests";
import prettier from "eslint-config-prettier";

export default [
    {
        // The legacy config linted TypeScript sources only (eslint --ext ts),
        // so JavaScript files (compiled output, e2e test fixtures) were never
        // checked. Preserve that scope by ignoring non-TS sources.
        ignores: [
            "**/out/**",
            "**/dist/**",
            "**/*.d.ts",
            "**/*.js",
            "**/*.mjs",
        ],
    },
    js.configs.recommended,
    {
        // ESLint 9+ defaults reportUnusedDisableDirectives to "warn"; the
        // legacy .eslintrc did not report these. Keep it off so this stays a
        // faithful config migration (existing disable comments are untouched).
        linterOptions: {
            reportUnusedDisableDirectives: "off",
        },
    },
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: "module",
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
            "no-only-tests": noOnlyTests,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            // TypeScript itself resolves undefined symbols; typescript-eslint
            // disables no-undef for TS (it produces false positives on types).
            "no-undef": "off",
            "@typescript-eslint/naming-convention": "warn",
            "curly": "warn",
            "eqeqeq": "warn",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "no-constant-condition": ["error", {checkLoops: false}],
            "no-empty": "off",
            "@typescript-eslint/no-empty-function": "off",
            "semi": "off",
            "no-console": "error",
            "no-only-tests/no-only-tests": "error",
        },
    },
    {
        files: ["**/*.test.ts", "**/test/**", "**/*.integ.ts"],
        rules: {
            "no-console": "off",
            "@typescript-eslint/no-unused-expressions": "off",
        },
    },
    {
        files: ["**/apis/*/*.ts"],
        rules: {
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-empty-object-type": "off",
        },
    },
    // Disable rules newly added to eslint:recommended in ESLint 10 so this
    // stays a faithful config migration (no new findings). These can be
    // enabled deliberately in a follow-up.
    {
        files: ["**/*.ts"],
        rules: {
            "no-useless-assignment": "off",
            "preserve-caught-error": "off",
        },
    },
    prettier,
];
