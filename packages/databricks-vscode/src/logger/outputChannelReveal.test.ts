import assert from "assert";
import {
    findRevealCommand,
    getLogChannelId,
    pickRevealCommand,
} from "./outputChannelReveal";

const EXTENSION_ID = "databricks.databricks";
const CHANNEL_NAME = "Databricks Bundle Logs";
const CHANNEL_ID = `${EXTENSION_ID}.${CHANNEL_NAME}`;
const REVEAL = `workbench.action.output.show.${CHANNEL_ID}`;
const SCOPED_REVEAL = `${REVEAL}.workspaceId-abc123`;

describe(__filename, function () {
    describe("getLogChannelId", function () {
        it("should leave the current channel names untouched", function () {
            assert.strictEqual(
                getLogChannelId(EXTENSION_ID, "Databricks Bundle Logs"),
                "databricks.databricks.Databricks Bundle Logs"
            );
            assert.strictEqual(
                getLogChannelId(EXTENSION_ID, "Databricks Logs"),
                "databricks.databricks.Databricks Logs"
            );
        });

        it("should strip the characters the host strips", function () {
            assert.strictEqual(
                getLogChannelId(EXTENSION_ID, 'a\\b/c:d*e?f"g<h>i|j'),
                "databricks.databricks.abcdefghij"
            );
        });
    });

    describe("pickRevealCommand", function () {
        it("should return undefined when the exact id is registered", function () {
            // VS Code: the ids agree, so `.show()` works and must not be shadowed.
            assert.strictEqual(
                pickRevealCommand([REVEAL], CHANNEL_ID),
                undefined
            );
        });

        it("should return the scoped command when only it is registered", function () {
            // Cursor: `.show()` sends the unscoped id and silently no-ops.
            assert.strictEqual(
                pickRevealCommand([SCOPED_REVEAL], CHANNEL_ID),
                SCOPED_REVEAL
            );
        });

        it("should prefer the exact id regardless of ordering", function () {
            assert.strictEqual(
                pickRevealCommand([REVEAL, SCOPED_REVEAL], CHANNEL_ID),
                undefined
            );
            assert.strictEqual(
                pickRevealCommand([SCOPED_REVEAL, REVEAL], CHANNEL_ID),
                undefined
            );
        });

        it("should return undefined when nothing matches", function () {
            assert.strictEqual(pickRevealCommand([], CHANNEL_ID), undefined);
            assert.strictEqual(
                pickRevealCommand(
                    [
                        "databricks.bundle.showLogs",
                        "workbench.action.files.save",
                    ],
                    CHANNEL_ID
                ),
                undefined
            );
        });

        it("should not match a longer channel name that starts with ours", function () {
            const otherChannel = `${REVEAL} Extra.workspaceId-abc123`;
            assert.strictEqual(
                pickRevealCommand([otherChannel], CHANNEL_ID),
                undefined
            );
        });

        it("should not match a suffix with more than one dot-segment", function () {
            assert.strictEqual(
                pickRevealCommand(
                    [`${REVEAL}.workspaceId-abc.extra`],
                    CHANNEL_ID
                ),
                undefined
            );
        });

        it("should disambiguate several candidates via the workspace scope", function () {
            assert.strictEqual(
                pickRevealCommand(
                    [`${REVEAL}.remote`, SCOPED_REVEAL],
                    CHANNEL_ID
                ),
                SCOPED_REVEAL
            );
        });

        it("should give up when the workspace scope is ambiguous", function () {
            assert.strictEqual(
                pickRevealCommand(
                    [SCOPED_REVEAL, `${REVEAL}.workspaceId-def456`],
                    CHANNEL_ID
                ),
                undefined
            );
        });

        it("should match case insensitively and return the id verbatim", function () {
            const differentlyCased = `workbench.action.output.show.Databricks.Databricks.${CHANNEL_NAME}.workspaceId-abc123`;
            assert.strictEqual(
                pickRevealCommand([differentlyCased], CHANNEL_ID),
                differentlyCased
            );
        });
    });

    describe("findRevealCommand", function () {
        it("should resolve against the injected command list", async function () {
            assert.strictEqual(
                await findRevealCommand(
                    EXTENSION_ID,
                    CHANNEL_NAME,
                    async () => [SCOPED_REVEAL]
                ),
                SCOPED_REVEAL
            );
        });

        it("should propagate errors so the caller can fall back", async function () {
            await assert.rejects(
                findRevealCommand(EXTENSION_ID, CHANNEL_NAME, () =>
                    Promise.reject(new Error("no commands"))
                ),
                /no commands/
            );
        });
    });
});
