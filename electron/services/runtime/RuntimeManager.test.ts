import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Release } from "./runtimeAssets";
import { RuntimeManager, type Installer } from "./RuntimeManager";

const binaryName =
  process.platform === "win32" ? "llama-server.exe" : "llama-server";

const release = (build: number): Release => {
  const tag = `prism-b${build}-abc`;
  return {
    tag_name: tag,
    published_at: "2026-10-31T00:00:00Z",
    assets: [
      {
        name: `llama-${tag}-bin-win-vulkan-x64.zip`,
        size: 100,
        browser_download_url: "https://example.test/x",
        digest: `sha256:${"a".repeat(64)}`,
      },
    ],
  };
};

/** An installer that "unpacks" by writing a fake llama-server */
function fakeInstaller(releases: Release[]): Installer {
  return {
    fetchReleases: vi.fn(async () => releases),
    downloadVerified: vi.fn(async (asset, file, onBytes) => {
      fs.writeFileSync(file, "zip");
      onBytes(asset.size);
    }),
    unpack: vi.fn(async (_archive, dir) => {
      fs.writeFileSync(path.join(dir, binaryName), "bin");
    }),
    findBinary: (dir) => {
      const file = path.join(dir, binaryName);
      return fs.existsSync(file) ? file : null;
    },
    smokeTest: vi.fn(async () => "version: 0.2.0-dev (build 1)"),
    readNvidiaDriver: vi.fn(async () => null),
  };
}

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "shield-runtime-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("RuntimeManager", () => {
  it("installs, activates and remembers a build across restarts", async () => {
    const io = fakeInstaller([release(2)]);
    const manager = new RuntimeManager(root, io);
    const phases: string[] = [];
    const runtime = await manager.install("win-vulkan", (p) =>
      phases.push(p.phase)
    );

    expect(runtime.tag).toBe("prism-b2-abc");
    expect(manager.activeBinary()).toBe(runtime.binary);
    expect(phases).toEqual(["downloading", "unpacking", "testing", "done"]);
    expect(fs.existsSync(path.join(root, "downloads"))).toBe(false);
    expect(new RuntimeManager(root, io).activeBinary()).toBe(runtime.binary);
  });

  it("removes a build that fails its check and keeps the old one", async () => {
    const io = fakeInstaller([release(1)]);
    const manager = new RuntimeManager(root, io);
    const first = await manager.install("win-vulkan", () => {});

    io.fetchReleases = vi.fn(async () => [release(2)]);
    io.smokeTest = vi.fn(async () => {
      throw new Error("This build lacks options SHIELD needs: --fit");
    });
    await expect(
      new RuntimeManager(root, io).install("win-vulkan", () => {})
    ).rejects.toThrow("--fit");

    expect(manager.activeBinary()).toBe(first.binary);
    expect(fs.existsSync(path.join(root, "prism-b2-abc-win-vulkan"))).toBe(
      false
    );
  });

  it("keeps one earlier build for a rollback and removes older ones", async () => {
    const io = fakeInstaller([release(1)]);
    const manager = new RuntimeManager(root, io);
    const b1 = await manager.install("win-vulkan", () => {});
    io.fetchReleases = vi.fn(async () => [release(2)]);
    const b2 = await new RuntimeManager(root, io).install(
      "win-vulkan",
      () => {}
    );
    io.fetchReleases = vi.fn(async () => [release(3)]);
    const latest = new RuntimeManager(root, io);
    const b3 = await latest.install("win-vulkan", () => {});

    expect(latest.installed().previous?.tag).toBe(b2.tag);
    expect(fs.existsSync(b1.dir)).toBe(false);

    expect(latest.rollback().tag).toBe(b2.tag);
    expect(latest.activeBinary()).toBe(b2.binary);
    expect(latest.installed().previous?.tag).toBe(b3.tag);
  });

  it("refuses a rollback with no earlier build", () => {
    expect(() =>
      new RuntimeManager(root, fakeInstaller([])).rollback()
    ).toThrow("no earlier build");
  });

  it("reports the newest release's download size", async () => {
    const manager = new RuntimeManager(root, fakeInstaller([release(5)]));
    expect(await manager.latest("win-vulkan")).toMatchObject({
      tag: "prism-b5-abc",
      downloadBytes: 100,
    });
    expect(await manager.latest("macos-x64")).toBeNull();
  });
});
