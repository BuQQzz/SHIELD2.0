import { describe, expect, it, vi } from "vitest";
import { processMCPToolCalls } from "./mcpMessageHandler";
import type { Message } from "../hooks/useLlama";

describe("processMCPToolCalls", () => {
    it("executes multiple tool calls and continues once", async () => {
        const assistantMessage: Message = {
            id: "assistant-1",
            role: "assistant",
            content: `<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path":"C:\\Users\\Test\\a.txt"}</arguments>
</tool_call>
<tool_call>
<server>filesystem</server>
<tool>list_directory</tool>
<arguments>{"path":"C:\\Users\\Test\\Desktop"}</arguments>
</tool_call>`,
            timestamp: new Date(),
        };

        const onToolCallDetected = vi
            .fn()
            .mockResolvedValueOnce({ success: true, data: { content: "alpha" } })
            .mockResolvedValueOnce({
                success: true,
                data: { files: ["a.txt", "b.txt"] },
            });

        const addMessage = vi.fn();
        const continueConversation = vi.fn();

        const handled = await processMCPToolCalls(assistantMessage, {
            onToolCallDetected,
            addMessage,
            continueConversation,
            maxToolCallsPerTurn: 5,
            enableHybridParser: true,
        });

        expect(handled).toBe(true);
        expect(onToolCallDetected).toHaveBeenCalledTimes(2);
        expect(addMessage).toHaveBeenCalledTimes(2);
        expect(continueConversation).toHaveBeenCalledTimes(1);

        const continuationPrompt = continueConversation.mock.calls[0]?.[0] as string;
        expect(continuationPrompt).toContain("You executed 2 tool call(s)");
        expect(continuationPrompt).toContain("read_file");
        expect(continuationPrompt).toContain("list_directory");
    });

    it("respects maxToolCallsPerTurn cap", async () => {
        const assistantMessage: Message = {
            id: "assistant-2",
            role: "assistant",
            content: `<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path":"C:\\Users\\Test\\a.txt"}</arguments>
</tool_call>
<tool_call>
<server>filesystem</server>
<tool>list_directory</tool>
<arguments>{"path":"C:\\Users\\Test\\Desktop"}</arguments>
</tool_call>`,
            timestamp: new Date(),
        };

        const onToolCallDetected = vi.fn().mockResolvedValue({ success: true, data: {} });
        const addMessage = vi.fn();
        const continueConversation = vi.fn();

        await processMCPToolCalls(assistantMessage, {
            onToolCallDetected,
            addMessage,
            continueConversation,
            maxToolCallsPerTurn: 1,
        });

        expect(onToolCallDetected).toHaveBeenCalledTimes(1);
        expect(addMessage).toHaveBeenCalledTimes(1);
        expect(continueConversation).toHaveBeenCalledTimes(1);
    });
});
