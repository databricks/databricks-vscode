import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The SDK integration tests (`yarn workspace databricks test:integ:sdk`, scripts/integration/sdk.mjs):
// a real workspace, so `yarn test` leaves them out.
export default defineConfig({
    resolve: {
        alias: {
            vscode: fileURLToPath(new URL("./src/test-support/vscode.ts", import.meta.url)),
        },
    },
    test: {
        include: ["src/test/integration-sdk/**/*.integ.ts"],
        environment: "node",
        testTimeout: 120_000,
        hookTimeout: 120_000,
    },
});
