/** Conversation titles: cleaning the model's, or one from the message */

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
