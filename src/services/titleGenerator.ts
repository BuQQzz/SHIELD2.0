import { LlamaChatSession } from "node-llama-cpp";

/**
 * Generate a short, descriptive title for a conversation based on the user's first message
 * @param session Active LlamaChatSession
 * @param userMessage The user's first message
 * @returns A short title (max 6 words) or "New Chat" on failure
 */
export async function generateConversationTitle(
  session: LlamaChatSession,
  userMessage: string
): Promise<string> {
  const titlePrompt = `Based on this user message, generate a short, concise title (max 6 words) that describes the topic or question. Only return the title, nothing else.

User message: "${userMessage}"

Title:`;

  try {
    const response = await session.prompt(titlePrompt, {
      temperature: 0.3, // Lower temperature for more focused titles
      maxTokens: 20,
    });

    // Clean up the response - remove quotes, trim, limit length
    let title = response.trim().replace(/^["']|["']$/g, "");

    // If title is too long, truncate intelligently
    const words = title.split(" ");
    if (words.length > 6) {
      title = words.slice(0, 6).join(" ") + "...";
    }

    return title || "New Chat";
  } catch (error) {
    console.error("[titleGenerator] Failed to generate title:", error);
    return "New Chat";
  }
}

/**
 * A title from the start of the message itself, for when the model gave none
 * (a thinking model can spend its whole budget thinking and answer nothing).
 */
export function titleFromMessage(userMessage: string): string {
  const firstLine = userMessage.trim().split(/\r?\n/)[0] ?? "";
  const words = firstLine
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "New Chat";
  const title = words.slice(0, 6).join(" ");
  return words.length > 6 ? `${title}...` : title;
}

/**
 * Clean and validate a conversation title
 * @param title Raw title string
 * @returns Cleaned title with max 6 words
 */
export function cleanTitle(title: string): string {
  // Remove quotes, trim whitespace
  let cleaned = title.trim().replace(/^["']|["']$/g, "");

  // Limit to 6 words
  const words = cleaned.split(" ");
  if (words.length > 6) {
    cleaned = words.slice(0, 6).join(" ") + "...";
  }

  return cleaned || "New Chat";
}
