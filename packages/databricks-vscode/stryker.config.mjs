// Mutation testing of src/kernel/ (`yarn workspace databricks
// mutation`). Measurement only: it is not part of `yarn check` or CI, and has
// no failing threshold. stryker.python.config.mjs covers features/python/.
//
//   mutation               full run (--force)
//   mutation:incremental   tests only the mutants that changed code or tests
//                          can affect since the last run

/**
 * @param {string} name the report and incremental file names under reports/mutation/
 * @param {string[]} mutate
 */
export function strykerConfig(name, mutate) {
    return {
        testRunner: "vitest",
        // The fast suite (test:fast), less one file that needs forks.
        vitest: { configFile: "vitest.stryker.config.mts" },
        mutate,
        reporters: ["html", "json", "clear-text", "progress"],
        htmlReporter: { fileName: `reports/mutation/${name}.html` },
        jsonReporter: { fileName: `reports/mutation/${name}.json` },
        // Reuses the last run's results for unchanged code and tests;
        // `--force` tests every mutant again, and still writes the file.
        incremental: true,
        incrementalFile: `reports/mutation/${name}.incremental.json`,
        // A sandbox in <root>/.stryker-tmp/sandbox-*/ is as deep as this
        // package, so tsconfig.json's `extends: "../../tsconfig.base.json"`
        // still resolves, and vite still reads its `target` (which decides
        // the class-field semantics). scripts/strykerSandbox.mjs links the e2e
        // package beside the sandboxes.
        tempDirName: "../../.stryker-tmp",
        // Stryker would rewrite that path for a sandbox inside this package,
        // with the TypeScript JS API, which TypeScript 7 no longer has. A
        // tsconfigFile that doesn't exist turns the rewrite off.
        tsconfigFile: "tsconfig.stryker-none.json",
        cleanTempDir: "always",
    };
}

export default strykerConfig("kernel", [
    "src/kernel/**/*.ts",
    "!src/kernel/**/*.test.ts",
    "!src/kernel/**/fixtures/**",
    // Re-exports only.
    "!src/kernel/cli/index.ts",
    "!src/kernel/compute/index.ts",
]);
