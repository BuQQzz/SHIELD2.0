/**
 * Downloading, checking and unpacking a Prism llama.cpp build (main process)
 */

import { execFile } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import {
  PRISM_REPO,
  sha256Of,
  type Release,
  type ReleaseAsset,
} from "./runtimeAssets.js";

const run = promisify(execFile);

/** The repository's newest releases, newest first */
export async function fetchReleases(): Promise<Release[]> {
  const response = await fetch(
    `https://api.github.com/repos/${PRISM_REPO}/releases?per_page=10`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for the release list`);
  }
  return (await response.json()) as Release[];
}

/**
 * Download one asset to `file`, hashing it on the way. Throws, and leaves no
 * file behind, when the hash differs from the one GitHub published.
 */
export async function downloadVerified(
  asset: ReleaseAsset,
  file: string,
  onBytes: (bytes: number) => void,
  signal: AbortSignal
): Promise<void> {
  const expected = sha256Of(asset);
  if (!expected) throw new Error(`${asset.name} has no published sha256`);

  const response = await fetch(asset.browser_download_url, { signal });
  if (!response.ok || !response.body) {
    throw new Error(`Download of ${asset.name} failed (${response.status})`);
  }
  const hash = createHash("sha256");
  const out = fs.createWriteStream(file);
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      if (!out.write(chunk)) {
        await new Promise((resolve) => out.once("drain", resolve));
      }
      onBytes(chunk.byteLength);
    }
    await new Promise<void>((resolve, reject) =>
      out.end((error?: Error | null) => (error ? reject(error) : resolve()))
    );
  } catch (error) {
    out.destroy();
    fs.rmSync(file, { force: true });
    throw error;
  }
  const actual = hash.digest("hex");
  if (actual !== expected) {
    fs.rmSync(file, { force: true });
    throw new Error(
      `${asset.name} did not match its published sha256 (got ${actual.slice(0, 12)}…)`
    );
  }
}

/**
 * Unpack a .zip or .tar.gz into `dir`. Windows' own tar (bsdtar) reads zip
 * files; a tar earlier on PATH (Git's GNU tar) does not, so it is named.
 */
export async function unpack(archive: string, dir: string): Promise<void> {
  const tar =
    process.platform === "win32"
      ? path.join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32",
          "tar.exe"
        )
      : "tar";
  await run(tar, ["-xf", archive, "-C", dir], { windowsHide: true });
}

/** llama-server inside an unpacked build, wherever the archive put it */
export function findBinary(dir: string): string | null {
  const name =
    process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === name) return full;
    }
  }
  return null;
}

/**
 * Check that the build starts and has the options SHIELD launches with;
 * returns its version line.
 */
export async function smokeTest(binary: string): Promise<string> {
  const options = {
    timeout: 30_000,
    windowsHide: true,
    cwd: path.dirname(binary),
  };
  const version = await run(binary, ["--version"], options);
  const versionLine =
    `${version.stdout}\n${version.stderr}`
      .split("\n")
      .find((line) => line.startsWith("version:"))
      ?.trim() ?? "version unknown";
  const help = await run(binary, ["--help"], {
    ...options,
    maxBuffer: 4 * 1024 * 1024,
  });
  const text = `${help.stdout}\n${help.stderr}`;
  const missing = ["--fit", "--spec-type", "--jinja"].filter(
    (flag) => !text.includes(flag)
  );
  if (missing.length > 0) {
    throw new Error(
      `This build lacks options SHIELD needs: ${missing.join(", ")}`
    );
  }
  return versionLine;
}

/** The NVIDIA driver's version line, or null without an NVIDIA driver */
export async function readNvidiaDriver(): Promise<string | null> {
  try {
    const { stdout } = await run(
      "nvidia-smi",
      ["--query-gpu=driver_version", "--format=csv,noheader"],
      { timeout: 10_000, windowsHide: true }
    );
    return stdout.split("\n")[0]?.trim() || null;
  } catch {
    return null;
  }
}
