import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        // Unit tests run under plain Node; `vscode` exists only in the host.
        alias: {
            vscode: fileURLToPath(new URL("./src/test-support/vscode.ts", import.meta.url)),
        },
    },
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
    },
});
