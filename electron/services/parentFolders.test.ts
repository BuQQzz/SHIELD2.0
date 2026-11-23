// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import path from "path";
import { makeParentFolders } from "./parentFolders";

describe("makeParentFolders", () => {
  it("creates the folders a new file needs", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shield-parents-"));
    const target = path.join(root, "src", "lib", "tokenize.js");
    await makeParentFolders("write_file", target, fsPromises.mkdir);
    expect(fs.statSync(path.join(root, "src", "lib")).isDirectory()).toBe(true);
    // A folder that is already there is fine
    await makeParentFolders("append_file", target, fsPromises.mkdir);
    fs.rmSync(root, { recursive: true });
  });

  it("leaves other tools and missing paths alone", async () => {
    const made: string[] = [];
    const mkdir = async (dir: string) => made.push(dir);
    await makeParentFolders("read_text_file", "/p/a/b.txt", mkdir);
    await makeParentFolders("edit_file", "/p/a/b.txt", mkdir);
    await makeParentFolders("write_file", undefined, mkdir);
    await makeParentFolders("write_file", "", mkdir);
    expect(made).toEqual([]);
  });
});
