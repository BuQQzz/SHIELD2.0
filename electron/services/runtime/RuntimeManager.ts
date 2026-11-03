/**
 * SHIELD's own llama-server builds (main process): installs, updates and
 * rolls back the Prism llama.cpp runtime under `<userData>/runtime`.
 *
 * Nothing installs on its own: the user asks from Settings › Runtime. A new
 * build is downloaded, checked against GitHub's sha256, unpacked into a
 * folder of its own and started once with --version and --help before it
 * becomes active; the next model load uses it. The build it replaced is kept
 * for a one-click rollback; older ones are removed.
 */

import fs from "fs";
import os from "os";
import path from "path";
import type {
  InstalledRuntime,
  RuntimeProgress,
  RuntimeRelease,
  RuntimeVariant,
} from "../../../src/types/runtime.js";
import {
  assetsFor,
  latestWith,
  parseDriverMajor,
  pickVariant,
  type Release,
} from "./runtimeAssets.js";
import * as installer from "./runtimeInstaller.js";

interface State {
  active?: InstalledRuntime;
  previous?: InstalledRuntime;
}

export type Installer = Pick<
  typeof installer,
  | "fetchReleases"
  | "downloadVerified"
  | "unpack"
  | "findBinary"
  | "smokeTest"
  | "readNvidiaDriver"
>;

export class RuntimeManager {
  private readonly stateFile: string;
  private state: State;
  private releases: Release[] | null = null;
  private abort: AbortController | null = null;

  constructor(
    private readonly root: string,
    private readonly io: Installer = installer
  ) {
    this.stateFile = path.join(root, "state.json");
    this.state = this.readState();
  }

  /** The active build's llama-server, if it is still on disk */
  activeBinary(): string | undefined {
    const binary = this.state.active?.binary;
    return binary && fs.existsSync(binary) ? binary : undefined;
  }

  installed(): State {
    return { ...this.state };
  }

  async recommendedVariant(): Promise<RuntimeVariant | null> {
    const driver = await this.io.readNvidiaDriver();
    return pickVariant(
      process.platform,
      os.arch(),
      driver ? parseDriverMajor(driver) : null
    );
  }

  /** The newest release that has the variant, or null */
  async latest(variant: RuntimeVariant): Promise<RuntimeRelease | null> {
    this.releases = await this.io.fetchReleases();
    const release = latestWith(this.releases, variant);
    if (!release) return null;
    const assets = assetsFor(release, variant)!;
    return {
      tag: release.tag_name,
      publishedAt: release.published_at,
      variant,
      downloadBytes: assets.reduce((sum, a) => sum + a.size, 0),
    };
  }

  /** Download, check and activate the newest build of a variant */
  async install(
    variant: RuntimeVariant,
    onProgress: (progress: RuntimeProgress) => void
  ): Promise<InstalledRuntime> {
    if (this.abort) throw new Error("An install is already running");
    const releases = this.releases ?? (await this.io.fetchReleases());
    const release = latestWith(releases, variant);
    if (!release) throw new Error(`No release has a ${variant} build`);
    const assets = assetsFor(release, variant)!;

    const dir = path.join(this.root, `${release.tag_name}-${variant}`);
    const downloads = path.join(this.root, "downloads");
    const total = assets.reduce((sum, a) => sum + a.size, 0);
    let received = 0;
    this.abort = new AbortController();
    try {
      fs.mkdirSync(downloads, { recursive: true });
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const files: string[] = [];
      for (const asset of assets) {
        const file = path.join(downloads, asset.name);
        await this.io.downloadVerified(
          asset,
          file,
          (bytes) => {
            received += bytes;
            onProgress({ phase: "downloading", received, total });
          },
          this.abort.signal
        );
        files.push(file);
      }
      onProgress({ phase: "unpacking", received, total });
      for (const file of files) await this.io.unpack(file, dir);
      const binary = this.io.findBinary(dir);
      if (!binary) throw new Error("The archive has no llama-server");
      onProgress({ phase: "testing", received, total });
      const version = await this.io.smokeTest(binary);

      const runtime: InstalledRuntime = {
        tag: release.tag_name,
        variant,
        dir,
        binary,
        version,
        installedAt: Date.now(),
      };
      this.activate(runtime);
      onProgress({ phase: "done", received, total });
      return runtime;
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw error;
    } finally {
      this.abort = null;
      fs.rmSync(downloads, { recursive: true, force: true });
    }
  }

  cancel(): void {
    this.abort?.abort();
  }

  /** Make the previous build active again (and the active one previous) */
  rollback(): InstalledRuntime {
    const { active, previous } = this.state;
    if (!previous || !fs.existsSync(previous.binary)) {
      throw new Error("There is no earlier build to go back to");
    }
    this.state = { active: previous, previous: active };
    this.writeState();
    return previous;
  }

  private activate(runtime: InstalledRuntime): void {
    const replaced = this.state.active;
    const dropped = this.state.previous;
    // Reinstalling the same build replaces it in place: no rollback target
    const keep = replaced && replaced.dir !== runtime.dir ? replaced : dropped;
    this.state = { active: runtime, previous: keep };
    this.writeState();
    for (const old of [replaced, dropped]) {
      if (old && old.dir !== runtime.dir && old.dir !== keep?.dir) {
        this.removeBuild(old.dir);
      }
    }
  }

  /** Only folders inside the runtime root, so a bad state file cannot reach out */
  private removeBuild(dir: string): void {
    const relative = path.relative(this.root, dir);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      return;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      // A server started from it may still hold its files (Windows)
      console.warn(`[Runtime] Could not remove ${dir}:`, error);
    }
  }

  private readState(): State {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, "utf8")) as State;
    } catch {
      return {};
    }
  }

  private writeState(): void {
    fs.mkdirSync(this.root, { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }
}
