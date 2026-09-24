import { describe, expect, it } from "vitest";
import {
  isMutatingTool,
  isReadOnlyTool,
  unavailableToolMessage,
} from "./toolClassification";

/** Every tool the official filesystem server exposes, as of Sept 2026 */
const FILESYSTEM_READS = [
  "read_file",
  "read_text_file",
  "read_media_file",
  "read_multiple_files",
  "list_directory",
  "list_directory_with_sizes",
  "directory_tree",
  "search_files",
  "get_file_info",
  "list_allowed_directories",
];

const FILESYSTEM_WRITES = [
  "write_file",
  "edit_file",
  "create_directory",
  "move_file",
];

describe("isMutatingTool", () => {
  it.each(FILESYSTEM_READS)("treats %s as read-only", (name) => {
    expect(isMutatingTool({ name })).toBe(false);
    expect(isReadOnlyTool({ name })).toBe(true);
  });

  it.each(FILESYSTEM_WRITES)("treats %s as mutating", (name) => {
    expect(isMutatingTool({ name })).toBe(true);
    expect(isReadOnlyTool({ name })).toBe(false);
  });

  it("covers every tool the filesystem server exposes", () => {
    // Guards against the server gaining a tool we silently misclassify
    expect(FILESYSTEM_READS.length + FILESYSTEM_WRITES.length).toBe(14);
  });
});

describe("unknown tools fail closed", () => {
  it("treats a tool from an unfamiliar server as mutating", () => {
    expect(isMutatingTool({ name: "send_email" })).toBe(true);
    expect(isMutatingTool({ name: "delete_everything" })).toBe(true);
  });

  it("does not guess from the name that it looks like a read", () => {
    // "get_" and "list_" prefixes are not a safe signal - a tool called
    // get_or_create_session mutates. Absent from the list means ask.
    expect(isMutatingTool({ name: "get_or_create_session" })).toBe(true);
    expect(isMutatingTool({ name: "list_and_archive" })).toBe(true);
  });
});

describe("server annotations win over the local list", () => {
  it("believes a server that says a new tool is read-only", () => {
    expect(
      isMutatingTool({
        name: "fetch_page",
        annotations: { readOnlyHint: true },
      })
    ).toBe(false);
  });

  it("believes a server that says a familiar tool mutates", () => {
    // If a server ever reports read_file as mutating, defer to it
    expect(
      isMutatingTool({
        name: "read_file",
        annotations: { readOnlyHint: false },
      })
    ).toBe(true);
  });

  it("falls back to the list when annotations are present but empty", () => {
    expect(isMutatingTool({ name: "read_file", annotations: {} })).toBe(false);
    expect(isMutatingTool({ name: "write_file", annotations: {} })).toBe(true);
  });
});

// Seen in the app, 2026-09-24: asked to delete a file, Qwen3-Coder called
// delete_file, which does not exist, and was told it was "disabled".
describe("unavailableToolMessage", () => {
  const known = ["read_text_file", "write_file", "move_file"];
  const offered = ["read_text_file", "write_file"];

  it("says a real tool is disabled and can be enabled", () => {
    const message = unavailableToolMessage("move_file", known, offered);
    expect(message).toContain("disabled in MCP tool settings");
  });

  it("says an invented tool does not exist and lists what does", () => {
    const message = unavailableToolMessage("delete_file", known, offered);
    expect(message).toContain("no tool called 'delete_file'");
    expect(message).toContain("read_text_file, write_file");
    expect(message).not.toContain("disabled");
    expect(message).toContain("not possible");
  });
});
