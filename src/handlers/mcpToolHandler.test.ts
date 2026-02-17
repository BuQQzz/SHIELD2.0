import { describe, expect, it } from "vitest";
import { extractToolCalls } from "./mcpToolHandler";

describe("extractToolCalls", () => {
    it("extracts XML tool calls", () => {
        const content = `<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path":"C:\\\\Users\\\\Test\\\\notes.txt"}</arguments>
</tool_call>`;

        const calls = extractToolCalls(content);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            serverName: "filesystem",
            tool: "read_file",
            arguments: { path: "C:\\Users\\Test\\notes.txt" },
            format: "xml",
        });
    });

    it("extracts OpenAI-style tool_calls from JSON block", () => {
        const payload = {
            tool_calls: [
                {
                    id: "call_123",
                    type: "function",
                    function: {
                        name: "filesystem.write_file",
                        arguments: JSON.stringify({
                            path: "C:\\Users\\Test\\todo.txt",
                            content: "hello",
                        }),
                    },
                },
            ],
        };

        const content = `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;

        const calls = extractToolCalls(content);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            serverName: "filesystem",
            tool: "write_file",
            arguments: {
                path: "C:\\Users\\Test\\todo.txt",
                content: "hello",
            },
            callId: "call_123",
            format: "openai",
        });
    });

    it("extracts OpenAI-style single function payload", () => {
        const content = JSON.stringify({
            name: "list_directory",
            arguments: { path: "C:\\Users\\Test\\Desktop" },
        });

        const calls = extractToolCalls(content);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            serverName: "filesystem",
            tool: "list_directory",
            arguments: { path: "C:\\Users\\Test\\Desktop" },
            format: "openai",
        });
    });

    it("extracts shorthand XML write_file tool calls", () => {
        const content = `<tool_call><write_file path="C:\\Users\\Test\\Desktop\\todo.html"><!DOCTYPE html><html><body>Todo</body></html></write_file></tool_call>`;

        const calls = extractToolCalls(content);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            serverName: "filesystem",
            tool: "write_file",
            arguments: {
                path: "C:\\Users\\Test\\Desktop\\todo.html",
                content: "<!DOCTYPE html><html><body>Todo</body></html>",
            },
            format: "xml",
        });
    });

    it("normalizes Public Desktop paths to home Desktop", () => {
        const content = `<tool_call>
<server>filesystem</server>
<tool>write_file</tool>
<arguments>{"path":"C:\\\\Users\\\\Public\\\\Desktop\\\\todo.html","content":"hello"}</arguments>
</tool_call>`;

        const calls = extractToolCalls(content);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            serverName: "filesystem",
            tool: "write_file",
            arguments: {
                path: "~\\Desktop\\todo.html",
                content: "hello",
            },
            format: "xml",
        });
    });
});
