// The fast suite (`test:fast`) for Stryker, which takes a config file, not
// CLI excludes. Keep the excludes in step with `test:fast` in package.json.
import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.mts";

export default mergeConfig(
    base,
    defineConfig({
        // tsconfig.json's `references` point outside the Stryker sandbox, and
        // vite fails to load them. tsconfig.test.json extends the same base
        // without references, so vite reads the same `target` from it.
        tsconfig: "tsconfig.test.json",
        test: {
            exclude: [
                ...configDefaults.exclude,
                "src/test/budgets/**",
                "src/features/python/python.test.ts",
                // Stryker runs vitest in worker threads, where vi.stubEnv("HOME")
                // doesn't reach os.homedir(), so two of its tests fail.
                "src/features/ai-tools/aiTools.test.ts",
            ],
        },
    }),
);
