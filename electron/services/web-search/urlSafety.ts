/**
 * Which addresses the model's web tools may open
 *
 * fetch_page loads a URL the model chose - possibly one a web page told it
 * to open. A browser can read file:// paths (outside the workspace SHIELD
 * limits file tools to) and reach services on this PC or the local network,
 * such as llama-server's own port. Only public http(s) addresses are
 * allowed, and trackers inside pages are dropped.
 */

import net from "net";

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

function ipv4Parts(address: string): number[] | null {
  if (net.isIPv4(address)) return address.split(".").map(Number);
  return null;
}

/** Loopback, private, link-local, carrier-grade NAT and unspecified */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "").toLowerCase();

  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = ipv4Parts(mapped ? mapped[1]! : bare);
  if (v4) {
    const [a, b] = v4 as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  if (net.isIPv6(bare)) {
    return (
      bare === "::" ||
      bare === "::1" ||
      /^f[cd]/.test(bare) || // unique local fc00::/7
      /^fe[89ab]/.test(bare) // link-local fe80::/10
    );
  }
  return false;
}

/** Names that always mean this machine or the local network */
function isLocalName(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") // single-label names resolve on the LAN
  );
}

/** Scheme and host as written; no DNS. Also used for every browser request */
export function checkPublicHttpUrl(raw: unknown): UrlCheck {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: "No URL provided" };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: `Not a valid URL: ${raw}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      reason: `Only http and https pages can be fetched, not ${url.protocol}`,
    };
  }
  if (isPrivateAddress(url.hostname) || isLocalName(url.hostname)) {
    return {
      ok: false,
      reason: `${url.hostname} is on this PC or the local network; only public web pages can be fetched`,
    };
  }
  return { ok: true, url };
}

/**
 * For every request the web session makes - redirects, frames, scripts -
 * so a public page cannot pull in local files or local services.
 * Other schemes (data:, blob:) stay allowed; pages use them for images.
 */
export function isBlockedBrowserRequest(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "file:") return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return isPrivateAddress(url.hostname) || isLocalName(url.hostname);
}

/** Analytics and ad hosts; subdomains match too */
const TRACKER_HOSTS = [
  "google-analytics.com",
  "googletagmanager.com",
  "analytics.google.com",
  "doubleclick.net",
  "googlesyndication.com",
  "adservice.google.com",
  "facebook.net",
  "mixpanel.com",
  "segment.io",
  "segment.com",
  "hotjar.com",
  "clarity.ms",
  "fullstory.com",
  "mouseflow.com",
  "inspectlet.com",
  "quantserve.com",
  "scorecardresearch.com",
];

/**
 * Trackers inside a page. Never the page itself: the old rule matched
 * words like "track" anywhere in a URL, which would block an article about
 * a soundtrack.
 */
export function isTrackerRequest(raw: string, resourceType: string): boolean {
  if (resourceType === "mainFrame") return false;
  if (resourceType === "ping") return true; // navigator.sendBeacon, <a ping>
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (TRACKER_HOSTS.some((t) => host === t || host.endsWith(`.${t}`))) {
    return true;
  }
  // The Meta pixel is served from the main facebook.com domain
  return /(^|\.)facebook\.com$/.test(host) && url.pathname.startsWith("/tr");
}

/** Everything the web session drops (see webSession.ts) */
export function shouldBlockWebRequest(
  raw: string,
  resourceType: string
): boolean {
  return isBlockedBrowserRequest(raw) || isTrackerRequest(raw, resourceType);
}

/**
 * The same check after DNS: a public-looking name can point at 127.0.0.1.
 * `lookup` returns every address the name resolves to.
 */
export async function checkPublicUrlResolved(
  raw: unknown,
  lookup: (hostname: string) => Promise<string[]>
): Promise<UrlCheck> {
  const check = checkPublicHttpUrl(raw);
  if (!check.ok || net.isIP(check.url.hostname.replace(/^\[|\]$/g, ""))) {
    return check;
  }
  let addresses: string[];
  try {
    addresses = await lookup(check.url.hostname);
  } catch {
    return {
      ok: false,
      reason: `Could not find ${check.url.hostname}; check the address`,
    };
  }
  if (addresses.some(isPrivateAddress)) {
    return {
      ok: false,
      reason: `${check.url.hostname} points to this PC or the local network; only public web pages can be fetched`,
    };
  }
  return check;
}
