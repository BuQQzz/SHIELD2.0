import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseExaFetch, parseExaSearch } from "./ExaFallback";

// Shaped like web_search_exa's reply (2026-11-14)
const SEARCH = `Title: US air travel should normalize by Sunday after ground stop
URL: https://apnews.com/article/ground-stop-flights
Published: 2026-11-14T07:11:12.000Z
Author: Kimberlee Kruesi
Highlights:
Transportation Secretary Sean Duffy said the problem began when a contractor was replacing old copper wire.

Title: FAA explains the nationwide ground stop
URL: https://www.faa.gov/newsroom/ground-stop
Published: 2026-11-13
Highlights:
The FAA said radar and radio gaps led to the stop.

Title: Not a page
URL: javascript:alert(1)
Highlights:
skip me
`;

describe("Exa search results", () => {
  it("become search results with titles, links and short snippets", () => {
    const results = parseExaSearch(SEARCH, 5);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: "US air travel should normalize by Sunday after ground stop",
      url: "https://apnews.com/article/ground-stop-flights",
      position: 1,
    });
    expect(results[0]!.snippet).toContain("Sean Duffy");
    expect(results[0]!.snippet).not.toContain("Published");
    expect(results[1]!.url).toBe("https://www.faa.gov/newsroom/ground-stop");
  });

  it("stop at the number asked for", () => {
    expect(parseExaSearch(SEARCH, 1)).toHaveLength(1);
    expect(parseExaSearch("nothing here", 5)).toEqual([]);
  });
});

describe("an Exa page read", () => {
  it("keeps the title and the text, not the metadata lines", () => {
    const page = parseExaFetch(
      "# Ground stop explained\nURL: https://x.org/a\nPublished: 2026-11-14\n\nAirlines canceled thousands of flights across the U.S. on Saturday.",
      "https://x.org/a"
    );
    expect(page?.title).toBe("Ground stop explained");
    expect(page?.text).toBe(
      "Airlines canceled thousands of flights across the U.S. on Saturday."
    );
    expect(
      parseExaFetch("# Empty\nURL: https://x.org/b", "https://x.org/b")
    ).toBeNull();
  });
});

const loadPage = vi.fn();
vi.mock("./InAppBrowser", () => ({
  loadPage: (...a: unknown[]) => loadPage(...a),
}));
const exaSearch = vi.fn();
const exaFetch = vi.fn();
vi.mock("./ExaFallback", async (original) => ({
  ...(await original<typeof import("./ExaFallback")>()),
  ExaFallback: class {
    search = exaSearch;
    fetch = exaFetch;
  },
}));

describe("web search with DuckDuckGo first and Exa as the backup", () => {
  beforeEach(() => {
    loadPage.mockReset();
    exaSearch.mockReset();
    exaFetch.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const service = async () =>
    new (await import("../WebSearchService")).WebSearchService();

  it("asks Exa when DuckDuckGo does not answer, and says nothing about it", async () => {
    loadPage.mockRejectedValue(new Error("The page did not load within 15 s"));
    exaSearch.mockResolvedValue([
      { title: "A", url: "https://a.org", snippet: "s", position: 1 },
    ]);
    const results = await (await service()).search("ground stop", 5);
    expect(results.map((r) => r.url)).toEqual(["https://a.org"]);
  });

  it("does not ask Exa when DuckDuckGo has results", async () => {
    loadPage.mockResolvedValue({
      html: '<div class="result"><a class="result__a" href="https://d.org">D</a><a class="result__snippet">s</a></div>',
      title: "",
      url: "",
    });
    const results = await (await service()).search("ground stop", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(exaSearch).not.toHaveBeenCalled();
  });

  it("fails as before when both fail", async () => {
    loadPage.mockRejectedValue(new Error("The page did not load within 15 s"));
    exaSearch.mockRejectedValue(new Error("Exa took longer than 20 s"));
    await expect((await service()).search("ground stop", 5)).rejects.toThrow(
      /did not load within 15 s/
    );
  });

  it("reads a page through Exa when the site will not serve SHIELD's browser", async () => {
    loadPage.mockRejectedValue(new Error("The site did not respond"));
    exaFetch.mockResolvedValue({
      title: "T",
      text: "The page text, long enough to keep.",
    });
    const page = await (
      await service()
    ).fetchPage("https://news.example.org/a");
    expect(page.textContent).toContain("The page text");
  });

  it("never sends a local or private address to Exa", async () => {
    loadPage.mockRejectedValue(
      new Error("Blocked: only public web pages can be opened")
    );
    await expect(
      (await service()).fetchPage("http://192.168.1.10/admin")
    ).rejects.toThrow();
    expect(exaFetch).not.toHaveBeenCalled();
  });
});
