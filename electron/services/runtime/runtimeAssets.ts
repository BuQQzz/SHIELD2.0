/**
 * Which Prism llama.cpp build fits this machine, and which release assets
 * make it up. Pure, so it is tested without the network.
 */

import type { RuntimeVariant } from "../../../src/types/runtime.js";

export const PRISM_REPO = "PrismML-Eng/llama.cpp";

/** The release SHIELD was last run with (the Bonsai demo's pinned build) */
export const TESTED_TAG = "prism-b10685-7dffb15";

export interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
  /** "sha256:<hex>", as the GitHub API reports it */
  digest?: string | null;
}

export interface Release {
  tag_name: string;
  published_at: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: ReleaseAsset[];
}

/**
 * Asset name patterns per variant, `{tag}` for the release tag. Windows CUDA
 * builds need the CUDA runtime DLLs from a second archive, unpacked into the
 * same folder.
 */
const VARIANT_ASSETS: Record<RuntimeVariant, string[]> = {
  "win-cuda-13.3": [
    "llama-{tag}-bin-win-cuda-13.3-x64.zip",
    "cudart-llama-bin-win-cuda-13.3-x64.zip",
  ],
  "win-cuda-12.4": [
    "llama-{tag}-bin-win-cuda-12.4-x64.zip",
    "cudart-llama-bin-win-cuda-12.4-x64.zip",
  ],
  "win-vulkan": ["llama-{tag}-bin-win-vulkan-x64.zip"],
  "win-cpu": ["llama-{tag}-bin-win-cpu-x64.zip"],
  "linux-cuda-13.3": ["llama-{tag}-bin-linux-cuda-13.3-x64.tar.gz"],
  "linux-cuda-12.4": ["llama-{tag}-bin-linux-cuda-12.4-x64.tar.gz"],
  "linux-vulkan": ["llama-{tag}-bin-ubuntu-vulkan-x64.tar.gz"],
  "linux-cpu": ["llama-{tag}-bin-ubuntu-x64.tar.gz"],
  "macos-arm64": ["llama-{tag}-bin-macos-arm64.tar.gz"],
  "macos-x64": ["llama-{tag}-bin-macos-x64.tar.gz"],
};

/** The variants a platform can run, best first */
export function variantsFor(
  platform: NodeJS.Platform,
  arch: string
): RuntimeVariant[] {
  if (platform === "win32" && arch === "x64") {
    return ["win-cuda-13.3", "win-cuda-12.4", "win-vulkan", "win-cpu"];
  }
  if (platform === "linux" && arch === "x64") {
    return ["linux-cuda-13.3", "linux-cuda-12.4", "linux-vulkan", "linux-cpu"];
  }
  if (platform === "darwin") {
    return [arch === "arm64" ? "macos-arm64" : "macos-x64"];
  }
  return [];
}

/**
 * The variant to install. CUDA 13 needs an NVIDIA driver from the 580
 * series, CUDA 12.4 one from 550; without an NVIDIA driver, Vulkan (AMD and
 * Intel GPUs, and a CPU fallback inside llama.cpp).
 */
export function pickVariant(
  platform: NodeJS.Platform,
  arch: string,
  nvidiaDriverMajor: number | null
): RuntimeVariant | null {
  const options = variantsFor(platform, arch);
  if (options.length <= 1) return options[0] ?? null;
  const [cuda13, cuda12, vulkan] = options;
  if (nvidiaDriverMajor !== null && nvidiaDriverMajor >= 580) return cuda13!;
  if (nvidiaDriverMajor !== null && nvidiaDriverMajor >= 550) return cuda12!;
  return vulkan!;
}

/** The driver's major version from `nvidia-smi` output ("581.57" → 581) */
export function parseDriverMajor(output: string): number | null {
  const match = output.trim().match(/^(\d+)\./);
  return match ? Number(match[1]) : null;
}

/** The release's assets for a variant; null when any is missing */
export function assetsFor(
  release: Release,
  variant: RuntimeVariant
): ReleaseAsset[] | null {
  const names = VARIANT_ASSETS[variant].map((pattern) =>
    pattern.replace("{tag}", release.tag_name)
  );
  const assets = names.map((name) =>
    release.assets.find((asset) => asset.name === name)
  );
  return assets.every(Boolean) ? (assets as ReleaseAsset[]) : null;
}

/** The newest published release that has the variant */
export function latestWith(
  releases: Release[],
  variant: RuntimeVariant
): Release | null {
  return (
    releases.find(
      (r) => !r.draft && !r.prerelease && assetsFor(r, variant) !== null
    ) ?? null
  );
}

/** The hex sha256 from a GitHub digest, or null if it is not one */
export function sha256Of(asset: ReleaseAsset): string | null {
  const match = asset.digest?.match(/^sha256:([0-9a-f]{64})$/i);
  return match ? match[1]!.toLowerCase() : null;
}
