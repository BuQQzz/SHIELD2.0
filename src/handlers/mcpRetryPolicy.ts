/**
 * MCP Retry Policy
 *
 * Detects refusal-style responses for tool-eligible requests and builds a
 * strict one-shot retry prompt to force tool-call output.
 */

const REFUSAL_PATTERNS: RegExp[] = [
    /don't have direct access/i,
    /do not have direct access/i,
    /cannot directly access your computer/i,
    /cannot directly access your computer or desktop/i,
    /can't access external systems/i,
    /cannot access external systems/i,
    /can't modify files on your device/i,
    /cannot modify files on your device/i,
    /i can't run code on your computer/i,
    /i cannot run code on your computer/i,
    /due to security and privacy restrictions/i,
    /i can guide you through/i,
    /i can help you create it yourself/i,
];

const TOOL_INTENT_PATTERNS: RegExp[] = [
    /\b(create|make|write|save|generate)\b[\s\S]*\b(file|html|desktop|documents?)\b/i,
    /\b(todo\s*list)\b[\s\S]*\b(html|file|desktop)\b/i,
    /\bwrite_file\b/i,
];

export function isLikelyMCPToolIntent(userContent: string): boolean {
    return TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(userContent));
}

export function shouldRetryWithMCP(
    userContent: string,
    assistantContent: string
): boolean {
    const hasRefusal = REFUSAL_PATTERNS.some((pattern) =>
        pattern.test(assistantContent)
    );
    if (!hasRefusal) {
        return false;
    }

    return isLikelyMCPToolIntent(userContent);
}

export function buildMCPRetryPrompt(
    userContent: string,
    allowedTools?: string[]
): string {
    const allowedToolsHint =
        allowedTools && allowedTools.length > 0
            ? `Allowed tools: ${allowedTools.join(", ")}.`
            : "Allowed tools are available from MCP.";

    return [
        "You have MCP filesystem tools available in this environment.",
        allowedToolsHint,
        "Do NOT refuse. Do NOT explain limitations.",
        "If the request is file-related, output ONLY a valid tool call in XML tool_call format.",
        "Prefer write_file for file creation requests.",
        "Use a full Windows path in Desktop or Documents.",
        "No prose before or after the tool call.",
        "",
        `User request: ${userContent}`,
    ].join("\n");
}
