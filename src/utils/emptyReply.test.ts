import { describe, expect, it } from "vitest";
import { emptyReplyMessage } from "./emptyReply";

describe("emptyReplyMessage", () => {
  it("names the limit and where to raise it", () => {
    const message = emptyReplyMessage(2048);
    expect(message).toContain("2,048 tokens");
    expect(message).toContain("Max Tokens in Settings > Model");
  });
  it("still reads well when the limit is not known", () => {
    expect(emptyReplyMessage(undefined)).toContain(
      "its whole reply limit thinking"
    );
  });
});
