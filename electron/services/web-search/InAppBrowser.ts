/**
 * The browser behind web_search and fetch_page (main process only)
 *
 * Pages load in a hidden window using Electron's own Chromium. Earlier this
 * drove a separate Chromium through Playwright, pinned to one playwright-core
 * version: after a dependency update it wanted build 1243 while 1208 was
 * installed, and every search failed (2026-09-24). A packaged SHIELD would
 * never have had that browser at all.
 *
 * Anonymous by construction: a session of its own that lives only in
 * memory, storage cleared after every page, no permissions, downloads or
 * popups, trackers dropped, Do-Not-Track and GPC sent, and the most common
 * Chrome user agent for this Chromium version. Nothing is shared with
 * SHIELD's own window or with any browser the user has.
 */

import { BrowserWindow, session, type Session } from "electron";
import { isBlockedBrowserRequest, shouldBlockWebRequest } from "./urlSafety";

/** No "persist:" prefix: Electron keeps this session in memory only */
const PARTITION = "shield-web";

let webSession: Session | null = null;

/** Chrome's reduced user agent: identical for most Windows Chrome users */
function commonUserAgent(): string {
  const major = process.versions.chrome?.split(".")[0] ?? "140";
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

function getWebSession(): Session {
  if (webSession) return webSession;
  const ses = session.fromPartition(PARTITION, { cache: false });

  ses.setUserAgent(commonUserAgent(), "en-US,en");
  ses.setSpellCheckerEnabled(false);
  // Camera, location, notifications, clipboard...: never
  ses.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  );
  ses.setPermissionCheckHandler(() => false);
  ses.on("will-download", (event) => event.preventDefault());

  // Every request - the page, its redirects, frames, scripts, images
  ses.webRequest.onBeforeRequest((details, callback) => {
    const blocked = shouldBlockWebRequest(details.url, details.resourceType);
    if (blocked && details.resourceType === "mainFrame") {
      console.warn(`[WebSearch] Blocked navigation to ${details.url}`);
    }
    callback({ cancel: blocked });
  });
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: { ...details.requestHeaders, DNT: "1", "Sec-GPC": "1" },
    });
  });

  webSession = ses;
  return ses;
}

export interface LoadedPage {
  html: string;
  title: string;
  /** Where the page ended up after redirects */
  url: string;
}

/** Time for scripts to fill in a page after it has loaded */
const SETTLE_MS = 400;

const wait = (ms: number) =>
  new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms));

/** "net::ERR_NAME_NOT_RESOLVED" and friends, said plainly */
function describeLoadError(error: Error): string {
  const code = error.message.match(/ERR_[A-Z_]+/)?.[0];
  switch (code) {
    case "ERR_BLOCKED_BY_CLIENT":
      return "Blocked: only public web pages can be opened";
    case "ERR_NAME_NOT_RESOLVED":
      return "The site's address could not be found";
    case "ERR_INTERNET_DISCONNECTED":
      return "This PC is not connected to the internet";
    case "ERR_CONNECTION_REFUSED":
    case "ERR_CONNECTION_TIMED_OUT":
    case "ERR_CONNECTION_RESET":
      return `The site did not respond (${code})`;
    default:
      return code ? `The page did not load (${code})` : error.message;
  }
}

/**
 * Load a page in a hidden window and return its HTML once scripts have
 * run. A page that never finishes loading (streaming, long polling) is
 * still read if its document arrived in time.
 */
export async function loadPage(
  url: string,
  timeoutMs = 15000
): Promise<LoadedPage> {
  const ses = getWebSession();
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      images: false,
      webgl: false,
      spellcheck: false,
      backgroundThrottling: false,
      disableDialogs: true,
      autoplayPolicy: "user-gesture-required",
    },
  });
  const contents = window.webContents;
  contents.setAudioMuted(true);
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  // Caught by the session filter too; this stops it before any request
  contents.on("will-navigate", (event, target) => {
    if (isBlockedBrowserRequest(target)) event.preventDefault();
  });

  let domReady = false;
  contents.on("dom-ready", () => {
    domReady = true;
  });

  try {
    const loading = contents.loadURL(url).then(
      () => "loaded" as const,
      (error: Error) => error
    );
    let outcome = await Promise.race([loading, wait(timeoutMs)]);

    // A script or meta refresh replaced the page: give the new one time
    if (outcome instanceof Error && /ERR_ABORTED/.test(outcome.message)) {
      outcome = await Promise.race([
        new Promise<"loaded">((resolve) =>
          contents.once("did-stop-loading", () => resolve("loaded"))
        ),
        wait(5000),
      ]);
    }
    if (outcome instanceof Error) throw new Error(describeLoadError(outcome));
    if (outcome === "timeout" && !domReady) {
      throw new Error(
        `The page did not load within ${Math.round(timeoutMs / 1000)} s`
      );
    }

    await wait(SETTLE_MS);
    const html = (await contents.executeJavaScript(
      "document.documentElement.outerHTML",
      true
    )) as string;
    return { html, title: contents.getTitle(), url: contents.getURL() };
  } finally {
    window.destroy();
    // Nothing carries over from one page to the next
    await ses
      .clearStorageData()
      .catch((error) =>
        console.warn("[WebSearch] Could not clear web session:", error)
      );
  }
}
