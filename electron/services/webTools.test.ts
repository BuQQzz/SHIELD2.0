// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  formatPageChunk,
  PAGE_CHUNK_CHARS,
  runWebTool,
  WEB_TOOLS,
  type WebToolDeps,
} from "./webTools";
import type { PageContent } from "./WebSearchService";

const page = (textContent: string): PageContent => ({
  url: "https://example.com/post",
  title: "A post",
  content: "",
  textContent,
  excerpt: "",
  length: textContent.length,
  fetchedAt: new Date(0),
  metadata: { domain: "example.com" },
});

const deps = (overrides: Partial<WebToolDeps> = {}): WebToolDeps => ({
  enabled: true,
  maxResults: 5,
  search: vi.fn().mockResolvedValue([
    {
      title: "Node.js 24 released",
      url: "https://nodejs.org/en/blog/release/v24.0.0",
      snippet: "Node.js 24 is now available.",
      position: 1,
    },
  ]),
  fetchPage: vi.fn().mockResolvedValue(page("Hello from the page.")),
  lookup: vi.fn().mockResolvedValue(["93.184.216.34"]),
  ...overrides,
});

const textOf = (result: { data?: unknown }) =>
  (result.data as { content: { text: string }[] }).content[0]!.text;

describe("WEB_TOOLS", () => {
  it("declares both tools read-only, so Auto runs them without asking", () => {
    for (const tool of WEB_TOOLS) {
      expect(tool.annotations.readOnlyHint).toBe(true);
    }
  });
});

describe("runWebTool", () => {
  it("refuses when web search is off in Settings", async () => {
    const d = deps({ enabled: false });
    const result = await runWebTool("web_search", { query: "x" }, d);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/turned off in Settings/);
    expect(d.search).not.toHaveBeenCalled();
  });

  it("returns numbered results with URLs and says how to read one", async () => {
    const d = deps();
    const result = await runWebTool("web_search", { query: " node 24 " }, d);
    expect(result.success).toBe(true);
    expect(d.search).toHaveBeenCalledWith("node 24", 5);
    const text = textOf(result);
    expect(text).toContain("1. Node.js 24 released");
    expect(text).toContain("https://nodejs.org/en/blog/release/v24.0.0");
    expect(text).toContain("fetch_page");
  });

  it("says when nothing was found", async () => {
    const d = deps({ search: vi.fn().mockResolvedValue([]) });
    const result = await runWebTool("web_search", { query: "zzz" }, d);
    expect(textOf(result)).toMatch(/No results/);
  });

  it("needs a query", async () => {
    const result = await runWebTool("web_search", {}, deps());
    expect(result.success).toBe(false);
  });

  it("reads a public page", async () => {
    const d = deps();
    const result = await runWebTool(
      "fetch_page",
      { url: "https://example.com/post" },
      d
    );
    expect(result.success).toBe(true);
    expect(textOf(result)).toContain("Hello from the page.");
    expect(d.fetchPage).toHaveBeenCalledWith("https://example.com/post");
  });

  it("never opens local files or services", async () => {
    for (const url of [
      "file:///C:/Users/me/.ssh/id_rsa",
      "http://127.0.0.1:59545/props",
      "http://localhost:5173/",
    ]) {
      const d = deps();
      const result = await runWebTool("fetch_page", { url }, d);
      expect(result.success).toBe(false);
      expect(d.fetchPage).not.toHaveBeenCalled();
    }
  });

  it("turns a failed search into a tool error with a next step", async () => {
    const d = deps({
      search: vi.fn().mockRejectedValue(new Error("Search failed: timeout")),
    });
    const result = await runWebTool("web_search", { query: "x" }, d);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^The search did not work: Search failed/);
    expect(result.error).toMatch(/Try once more/);
    expect(result.error).toMatch(/Do not try to work around/);
  });

  // Told only "Failed to initialize web search browser", Qwen3-Coder wrote
  // a script into the workspace to find the Node.js version (2026-09-24)
  it("says web search is unavailable offline, not to work around it", async () => {
    const offline = new Error(
      "Failed to fetch page: This PC is not connected to the internet"
    );
    const d = deps({ fetchPage: vi.fn().mockRejectedValue(offline) });
    const result = await runWebTool(
      "fetch_page",
      { url: "https://example.com/" },
      d
    );
    expect(result.error).toMatch(/^Web search is unavailable/);
    expect(result.error).toMatch(/Do not try to work around/);
  });

  it("suggests another result when one page cannot be read", async () => {
    const d = deps({
      fetchPage: vi.fn().mockRejectedValue(new Error("Timeout 15000ms")),
    });
    const result = await runWebTool(
      "fetch_page",
      { url: "https://example.com/" },
      d
    );
    expect(result.error).toBe(
      "Could not read this page: Timeout 15000ms. Try another result, or answer from the search snippets."
    );
  });
});

describe("formatPageChunk", () => {
  const long = page("a".repeat(PAGE_CHUNK_CHARS * 2 + 100));

  it("returns the first chunk and where to read on", () => {
    const text = formatPageChunk(long);
    expect(text).toContain(`"start": ${PAGE_CHUNK_CHARS}`);
    expect(text).toContain("Characters 1-8,000 of 16,100");
  });

  it("reads on from start, and stops offering more at the end", () => {
    const text = formatPageChunk(long, PAGE_CHUNK_CHARS * 2);
    expect(text).toContain("Characters 16,001-16,100 of 16,100");
    expect(text).not.toContain('"start"');
  });

  it("shows a short page whole, without a range", () => {
    const text = formatPageChunk(page("Short."));
    expect(text).not.toContain("Characters");
    expect(text).toContain("Short.");
  });

  it("explains an empty page", () => {
    expect(formatPageChunk(page("  "))).toMatch(/no readable text/);
  });
});
