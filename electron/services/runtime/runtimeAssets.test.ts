import { describe, expect, it } from "vitest";
import {
  assetsFor,
  latestWith,
  parseDriverMajor,
  pickVariant,
  sha256Of,
  type Release,
} from "./runtimeAssets";

const asset = (name: string, size = 10) => ({
  name,
  size,
  browser_download_url: `https://example.test/${name}`,
  digest: `sha256:${"a".repeat(64)}`,
});

const release = (tag: string, names: string[], extra = {}): Release => ({
  tag_name: tag,
  published_at: "2026-10-31T00:00:00Z",
  assets: names.map((n) => asset(n)),
  ...extra,
});

describe("pickVariant", () => {
  it("takes CUDA 13 from the 580 driver series", () => {
    expect(pickVariant("win32", "x64", 581)).toBe("win-cuda-13.3");
    expect(pickVariant("linux", "x64", 580)).toBe("linux-cuda-13.3");
  });

  it("falls back to CUDA 12 on older drivers, then Vulkan", () => {
    expect(pickVariant("win32", "x64", 552)).toBe("win-cuda-12.4");
    expect(pickVariant("win32", "x64", 470)).toBe("win-vulkan");
    expect(pickVariant("linux", "x64", null)).toBe("linux-vulkan");
  });

  it("has one build for a Mac and none for unknown platforms", () => {
    expect(pickVariant("darwin", "arm64", null)).toBe("macos-arm64");
    expect(pickVariant("freebsd", "x64", 590)).toBeNull();
  });
});

describe("parseDriverMajor", () => {
  it("reads nvidia-smi's version line", () => {
    expect(parseDriverMajor("581.57\n")).toBe(581);
    expect(parseDriverMajor("")).toBeNull();
  });
});

describe("assetsFor", () => {
  const tag = "prism-b12128-d7b2896";

  it("pairs a Windows CUDA build with its runtime DLLs", () => {
    const r = release(tag, [
      `llama-${tag}-bin-win-cuda-13.3-x64.zip`,
      "cudart-llama-bin-win-cuda-13.3-x64.zip",
    ]);
    expect(assetsFor(r, "win-cuda-13.3")?.map((a) => a.name)).toEqual([
      `llama-${tag}-bin-win-cuda-13.3-x64.zip`,
      "cudart-llama-bin-win-cuda-13.3-x64.zip",
    ]);
  });

  it("is null when a needed archive is missing", () => {
    const r = release(tag, [`llama-${tag}-bin-win-cuda-13.3-x64.zip`]);
    expect(assetsFor(r, "win-cuda-13.3")).toBeNull();
  });
});

describe("latestWith", () => {
  it("skips drafts, prereleases and releases without the build", () => {
    const releases = [
      release("prism-b3", ["llama-prism-b3-bin-win-vulkan-x64.zip"], {
        prerelease: true,
      }),
      release("prism-b2", ["llama-prism-b2-bin-win-cpu-x64.zip"]),
      release("prism-b1", ["llama-prism-b1-bin-win-vulkan-x64.zip"]),
    ];
    expect(latestWith(releases, "win-vulkan")?.tag_name).toBe("prism-b1");
    expect(latestWith(releases, "macos-x64")).toBeNull();
  });
});

describe("sha256Of", () => {
  it("reads GitHub's digest and refuses anything else", () => {
    expect(sha256Of(asset("x"))).toBe("a".repeat(64));
    expect(sha256Of({ ...asset("x"), digest: null })).toBeNull();
    expect(sha256Of({ ...asset("x"), digest: "md5:abc" })).toBeNull();
  });
});
