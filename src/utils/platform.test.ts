import { describe, expect, it } from "vitest";
import {
  hostOs,
  osFromNodePlatform,
  osName,
  samplePath,
  trashName,
} from "./platform";

describe("hostOs", () => {
  it.each([
    [{ platform: "Linux x86_64" }, "linux"],
    [
      { platform: "", userAgent: "Mozilla/5.0 (X11; Linux x86_64) Electron" },
      "linux",
    ],
    [{ platform: "MacIntel" }, "mac"],
    [{ platform: "Win32" }, "windows"],
  ] as const)("reads %o as %s", (nav, expected) => {
    expect(hostOs(nav)).toBe(expected);
  });

  it("assumes Windows when it cannot tell", () => {
    expect(hostOs({})).toBe("windows");
    expect(hostOs({ platform: "" })).toBe("windows");
  });

  it("words prompts for the host", () => {
    expect(osName("linux")).toBe("Linux");
    expect(osName("mac")).toBe("macOS");
    expect(osName("windows")).toBe("Windows");
    expect(samplePath("linux")).toBe("/home/name/Desktop/file.txt");
    expect(samplePath("windows")).toContain("C:");
  });
});

describe("trashName and the main process", () => {
  it("names the place deleted files go on each system", () => {
    expect(trashName("windows")).toBe("Recycle Bin");
    expect(trashName("linux")).toBe("Trash");
    expect(trashName("mac")).toBe("Trash");
  });

  it("maps Node's process.platform, which the main process (no navigator) reads", () => {
    expect(osFromNodePlatform("win32")).toBe("windows");
    expect(osFromNodePlatform("darwin")).toBe("mac");
    expect(osFromNodePlatform("linux")).toBe("linux");
    expect(osFromNodePlatform("freebsd")).toBe("linux");
  });
});
