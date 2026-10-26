/**
 * Said when the model answered with nothing. A thinking model (Bonsai 27B)
 * spends its reply limit on thought and, when the limit is small, ends with
 * no answer at all; the user saw only "Failed to get response" (2026-10-20:
 * 2,048 tokens, all of them thinking).
 */
export function emptyReplyMessage(maxTokens: number | undefined): string {
  const limit = maxTokens
    ? `its whole reply limit (${maxTokens.toLocaleString("en-US")} tokens)`
    : "its whole reply limit";
  return `The model used ${limit} thinking and wrote no answer. A thinking model needs more room: raise Max Tokens in Settings > Model (8,192 or more suits Bonsai), or ask again.`;
}
