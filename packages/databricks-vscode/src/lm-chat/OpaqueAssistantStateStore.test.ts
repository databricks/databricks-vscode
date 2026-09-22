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

        const restored = store.createRestoreSession().restore([
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

    it("restores the same tool call across multiple later requests", () => {
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
                        arguments: '{"filePath":"test.py"}',
                    },
                },
            ],
        });

        const toolCalls = [
            {
                id: "read_file__vscode-0",
                type: "function" as const,
                function: {
                    name: "read_file",
                    arguments: '{"filePath":"test.py"}',
                },
            },
        ];

        const first = store.createRestoreSession().restore(toolCalls);
        const second = store.createRestoreSession().restore(toolCalls);

        assert.strictEqual(
            first?.tool_calls?.[0].thoughtSignature,
            "opaque-signature"
        );
        assert.strictEqual(
            second?.tool_calls?.[0].thoughtSignature,
            "opaque-signature"
        );
    });

    it("maps repeated identical tool calls to successive stored occurrences", () => {
        const store = new OpaqueAssistantStateStore();
        for (const signature of ["signature-1", "signature-2"]) {
            store.remember({
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "read_file",
                        type: "function",
                        thoughtSignature: signature,
                        function: {
                            name: "read_file",
                            arguments: '{"filePath":"test.py"}',
                        },
                    },
                ],
            });
        }

        const toolCalls = [
            {
                id: "read_file__vscode-0",
                type: "function" as const,
                function: {
                    name: "read_file",
                    arguments: '{"filePath":"test.py"}',
                },
            },
        ];

        const session = store.createRestoreSession();
        const first = session.restore(toolCalls);
        const second = session.restore(toolCalls);
        const third = session.restore(toolCalls);

        assert.strictEqual(
            first?.tool_calls?.[0].thoughtSignature,
            "signature-1"
        );
        assert.strictEqual(
            second?.tool_calls?.[0].thoughtSignature,
            "signature-2"
        );
        // Beyond the stored occurrences, fall back to the last known signature
        // rather than dropping it entirely.
        assert.strictEqual(
            third?.tool_calls?.[0].thoughtSignature,
            "signature-2"
        );
    });
});
