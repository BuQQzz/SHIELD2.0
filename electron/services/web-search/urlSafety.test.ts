// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  checkPublicHttpUrl,
  checkPublicUrlResolved,
  isBlockedBrowserRequest,
  isPrivateAddress,
  isTrackerRequest,
  shouldBlockWebRequest,
} from "./urlSafety";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("%s is private", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700::1111"])(
    "%s is public",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    }
  );
});

describe("checkPublicHttpUrl", () => {
  it("allows public http and https pages", () => {
    expect(checkPublicHttpUrl("https://example.com/docs").ok).toBe(true);
    expect(checkPublicHttpUrl("http://8.8.8.8/").ok).toBe(true);
  });

  it.each([
    ["file:///C:/Users/me/secrets.txt", /Only http and https/],
    ["javascript:alert(1)", /Only http and https/],
    ["http://localhost:8080/", /this PC or the local network/],
    ["http://127.0.0.1:59545/props", /this PC or the local network/],
    ["http://2130706433/", /this PC or the local network/], // 127.0.0.1
    ["http://[::1]/", /this PC or the local network/],
    ["http://printer.local/", /this PC or the local network/],
    ["http://intranet/", /this PC or the local network/],
    ["not a url", /Not a valid URL/],
    ["", /No URL/],
  ])("refuses %s", (url, reason) => {
    const check = checkPublicHttpUrl(url);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(reason);
  });
});

describe("checkPublicUrlResolved", () => {
  it("refuses a public-looking name that points at this PC", async () => {
    const check = await checkPublicUrlResolved(
      "https://localtest.me/",
      async () => ["127.0.0.1"]
    );
    expect(check.ok).toBe(false);
  });

  it("allows a name that resolves to public addresses", async () => {
    const check = await checkPublicUrlResolved(
      "https://example.com/",
      async () => ["93.184.216.34", "2606:2800::1"]
    );
    expect(check.ok).toBe(true);
  });

  it("says so when the name does not resolve", async () => {
    const check = await checkPublicUrlResolved(
      "https://no-such-host.example/",
      async () => {
        throw new Error("ENOTFOUND");
      }
    );
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/Could not find/);
  });
});

describe("isBlockedBrowserRequest", () => {
  it("blocks local files and local services, even as sub-requests", () => {
    expect(isBlockedBrowserRequest("file:///C:/Windows/win.ini")).toBe(true);
    expect(isBlockedBrowserRequest("http://127.0.0.1:59545/")).toBe(true);
    expect(isBlockedBrowserRequest("http://192.168.1.1/admin")).toBe(true);
  });

  it("lets ordinary page resources through", () => {
    expect(isBlockedBrowserRequest("https://cdn.example.com/app.js")).toBe(
      false
    );
    expect(isBlockedBrowserRequest("data:image/png;base64,AAAA")).toBe(false);
  });
});

describe("isTrackerRequest", () => {
  it("drops analytics hosts and beacons inside a page", () => {
    expect(
      isTrackerRequest("https://www.google-analytics.com/g/collect", "xhr")
    ).toBe(true);
    expect(
      isTrackerRequest("https://static.hotjar.com/c/hotjar.js", "script")
    ).toBe(true);
    expect(isTrackerRequest("https://www.facebook.com/tr?id=1", "image")).toBe(
      true
    );
    expect(isTrackerRequest("https://example.com/collect", "ping")).toBe(true);
  });

  it("never blocks the page asked for, or words that only look like trackers", () => {
    expect(
      isTrackerRequest("https://example.com/soundtrack-review", "mainFrame")
    ).toBe(false);
    expect(
      isTrackerRequest("https://docs.example.com/analytics/intro", "script")
    ).toBe(false);
    expect(
      isTrackerRequest("https://www.google-analytics.com/", "mainFrame")
    ).toBe(false);
  });
});

describe("shouldBlockWebRequest", () => {
  it("blocks local addresses even for the page itself", () => {
    expect(shouldBlockWebRequest("http://127.0.0.1:8080/", "mainFrame")).toBe(
      true
    );
    expect(shouldBlockWebRequest("https://example.com/", "mainFrame")).toBe(
      false
    );
  });
});
