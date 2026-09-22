/* eslint-disable @typescript-eslint/naming-convention */
import assert from "assert";
import {OpaqueAssistantStateStore} from "./OpaqueAssistantStateStore";

describe(__filename, () => {
    it("rehydrates extra tool-call fields and remaps Copilot call ids", () => {
        const store = new OpaqueAssistantStateStore();
        store.remember({
            role: "assistant",
            content: null,
            tool_calls: [
                {
                    id: "read_file",
                    type: "function",
                    thoughtSignature: "opaque-signature",
                    function: {
                        name: "read_file",
                        arguments: '{"endLine":100,"filePath":"test.py"}',
                    },
                },
            ],
        });

        const restored = store.restore([
            {
                id: "read_file__vscode-0",
                type: "function",
                function: {
                    name: "read_file",
                    arguments: '{"filePath":"test.py","endLine":100}',
                },
            },
        ]);

        assert.deepStrictEqual(restored, {
            role: "assistant",
            content: null,
            tool_calls: [
                {
                    id: "read_file__vscode-0",
                    type: "function",
                    thoughtSignature: "opaque-signature",
                    function: {
                        name: "read_file",
                        arguments: '{"filePath":"test.py","endLine":100}',
                    },
                },
            ],
        });
    });
});
