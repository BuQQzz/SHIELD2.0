/**
 * Page check: load a web page the model wrote in a hidden window and report
 * what goes wrong as it loads. A syntax check passes a page that throws on
 * its first line: in g21 step 1 Bonsai 2 checked spend.html's script with
 * `new Function`, and the page threw "(d.getMonth(...) + 1).padStart is not
 * a function" as it opened (2026-11-11).
 *
 * The window is sandboxed, never shown, in its own in-memory session with
 * fresh storage (a first visit), and reaches nothing beyond local files:
 * other requests, new windows and navigation away are refused.
 */

import { BrowserWindow, session } from "electron";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/** How long the page runs after it loads, for timers and late errors */
const SETTLE_MS = 1500;
/** The whole check, at most */
const LIMIT_MS = 10_000;
const MAX_ERRORS = 5;

/** Addresses the check in progress refused */
let blocked: string[] = [];
/** One check at a time */
let queue: Promise<unknown> = Promise.resolve();
let checks = 0;

/**
 * A new in-memory session for each check, so each page starts with empty
 * storage. Clearing one shared session between checks made the next one
 * fail to load its file (ERR_FAILED).
 */
function pageSession(): Electron.Session {
  const ses = session.fromPartition(`shield-page-check-${++checks}`);
  ses.webRequest.onBeforeRequest((details, callback) => {
    const local = /^(file|data|blob|about|devtools):/i.test(details.url);
    if (!local && !blocked.includes(details.url)) blocked.push(details.url);
    callback({ cancel: !local });
  });
  ses.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  );
  return ses;
}

/**
 * What goes wrong as an .html file loads: its errors, and the addresses
 * outside the computer it tried to reach (refused here, so errors that
 * follow may come from that). Empty when nothing did.
 */
export function checkPage(
  file: string
): Promise<{ errors: string[]; blocked: string[] }> {
  const run = queue.then(() => checkOne(file));
  queue = run.catch(() => {});
  return run;
}

async function checkOne(
  file: string
): Promise<{ errors: string[]; blocked: string[] }> {
  if (
    !path.isAbsolute(file) ||
    !/\.html?$/i.test(file) ||
    !fs.existsSync(file)
  ) {
    return { errors: [], blocked: [] };
  }
  const ses = pageSession();
  blocked = [];
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Hidden windows are throttled; the page should run as if open
      backgroundThrottling: false,
    },
  });
  const errors: string[] = [];
  const add = (text: string) => {
    if (errors.length < MAX_ERRORS && !errors.includes(text)) errors.push(text);
  };
  const url = pathToFileURL(file).href;
  const contents = win.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, target) => {
    if (!target.startsWith("file:")) event.preventDefault();
  });
  contents.on("console-message", (event) => {
    const { level, message, lineNumber, sourceId } = event as unknown as {
      level: string;
      message: string;
      lineNumber?: number;
      sourceId?: string;
    };
    // The refusals are reported once, as blocked addresses
    if (level !== "error" || /ERR_BLOCKED_BY_CLIENT/.test(message)) return;
    const where =
      sourceId && lineNumber
        ? ` (${path.basename(sourceId)}, line ${lineNumber})`
        : "";
    add(`${message}${where}`);
  });
  contents.on("did-fail-load", (_event, code, description, failedUrl) => {
    // A refused request (ours) is reported as a blocked address
    if (code !== -3 && code !== -20)
      add(`Failed to load ${failedUrl}: ${description}`);
  });
  contents.on("render-process-gone", (_event, details) => {
    add(`The page's process stopped: ${details.reason}`);
  });
  try {
    await Promise.race([
      win.loadURL(url).then(() => new Promise((r) => setTimeout(r, SETTLE_MS))),
      new Promise((r) => setTimeout(r, LIMIT_MS)),
    ]);
  } catch (error) {
    add(error instanceof Error ? error.message : String(error));
  } finally {
    // The next check starts once this window is gone: one started sooner
    // failed to load its file (ERR_FAILED)
    if (!win.isDestroyed()) {
      const closed = new Promise((r) => win.once("closed", r));
      win.destroy();
      await closed;
    }
  }
  return { errors, blocked: blocked.slice(0, MAX_ERRORS) };
}
