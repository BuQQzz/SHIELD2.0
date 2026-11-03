/**
 * The llama-server runtime SHIELD runs local models with: a Prism build of
 * llama.cpp (a superset of upstream that also runs Bonsai), installed and
 * updated from Settings › Runtime.
 */

/** Which build of a release: the GPU backend it was compiled for */
export type RuntimeVariant =
  | "win-cuda-13.3"
  | "win-cuda-12.4"
  | "win-vulkan"
  | "win-cpu"
  | "linux-cuda-13.3"
  | "linux-cuda-12.4"
  | "linux-vulkan"
  | "linux-cpu"
  | "macos-arm64"
  | "macos-x64";

/** One installed build */
export interface InstalledRuntime {
  /** Release tag, e.g. "prism-b12128-d7b2896" */
  tag: string;
  variant: RuntimeVariant;
  /** Folder it was unpacked into */
  dir: string;
  /** Path of llama-server inside it */
  binary: string;
  /** `llama-server --version`'s first line */
  version: string;
  installedAt: number;
}

/** Where the llama-server SHIELD would use comes from, in lookup order */
export type RuntimeSource = "env" | "managed" | "bonsai-demo" | "none";

export interface RuntimeStatus {
  source: RuntimeSource;
  /** The binary a model load would start, if any */
  binary?: string;
  active?: InstalledRuntime;
  /** The build before the active one, kept for a rollback */
  previous?: InstalledRuntime;
  /** The variant this machine would get */
  recommendedVariant: RuntimeVariant | null;
  /** The release SHIELD was last tested with */
  testedTag: string;
}

/** The newest release, as offered for install */
export interface RuntimeRelease {
  tag: string;
  publishedAt: string;
  variant: RuntimeVariant;
  /** Bytes to download for this variant (all its archives) */
  downloadBytes: number;
}

export interface RuntimeProgress {
  phase: "downloading" | "verifying" | "unpacking" | "testing" | "done";
  /** Bytes downloaded so far, across the variant's archives */
  received: number;
  total: number;
}
