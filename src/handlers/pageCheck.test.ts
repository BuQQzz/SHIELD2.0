import { describe, expect, it, vi } from "vitest";
import { withPageCheck } from "./mcpMessageHandler";

const call = (tool: string, path: string) => ({
  serverName: "filesystem",
  tool,
  arguments: { path, content: "<html></html>" },
});
const ok = { success: true, data: "Successfully wrote to /p/spend.html" };

describe("withPageCheck (g21 step 1)", () => {
  it("adds what the page reported after a write to an .html file", async () => {
    const check = vi.fn(async () => ({
      errors: [
        "Uncaught TypeError: (d.getMonth(...) + 1).padStart is not a function (spend.html, line 162)",
      ],
      blocked: [],
    }));
    const out = await withPageCheck(
      call("write_file", "/p/spend.html"),
      ok,
      check
    );
    expect(check).toHaveBeenCalledWith("/p/spend.html");
    expect(String(out.data)).toContain("Successfully wrote");
    expect(String(out.data)).toContain(
      "padStart is not a function (spend.html, line 162)"
    );
    expect(String(out.data)).toContain(
      "Fix these before you tell the user it works."
    );
  });

  it("says a clean page loaded, and names blocked addresses", async () => {
    const out = await withPageCheck(
      call("edit_file", "/p/index.htm"),
      ok,
      async () => ({
        errors: [],
        blocked: ["https://cdn.example.com/chart.js"],
      })
    );
    expect(String(out.data)).toContain("it loaded with no errors");
    expect(String(out.data)).toContain("- https://cdn.example.com/chart.js");
  });

  it("leaves other files, failed calls and relative paths alone", async () => {
    const check = vi.fn(async () => ({ errors: ["x"], blocked: [] }));
    await withPageCheck(call("write_file", "/p/spend.py"), ok, check);
    await withPageCheck(call("read_text_file", "/p/spend.html"), ok, check);
    await withPageCheck(call("write_file", "spend.html"), ok, check);
    const failed = { success: false, error: "denied" };
    expect(
      await withPageCheck(call("write_file", "/p/spend.html"), failed, check)
    ).toBe(failed);
    expect(check).not.toHaveBeenCalled();
  });
});
