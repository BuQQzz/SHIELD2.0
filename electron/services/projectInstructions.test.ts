// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  MAX_INSTRUCTION_CHARS,
  projectFacts,
  readProjectInstructions,
} from "./projectInstructions";

let dir = "";
const write = async (rel: string, text: string) => {
  const file = path.join(dir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "shield-agents-"));
});
afterEach(() => fs.rm(dir, { recursive: true, force: true }));

describe("readProjectInstructions", () => {
  it("reads every AGENTS.md from the repository root down, root first", async () => {
    await fs.mkdir(path.join(dir, ".git"));
    await write("AGENTS.md", "Use pnpm.");
    await write("packages/web/AGENTS.md", "Web tests: pnpm test:web");
    const found = await readProjectInstructions(
      path.join(dir, "packages", "web")
    );
    expect(found.files).toEqual([
      path.join(dir, "AGENTS.md"),
      path.join(dir, "packages", "web", "AGENTS.md"),
    ]);
    expect(found.text.indexOf("Use pnpm.")).toBeLessThan(
      found.text.indexOf("Web tests")
    );
  });

  it("reads only the folder's own outside a repository", async () => {
    await write("AGENTS.md", "outer");
    await write("inner/AGENTS.md", "inner rules");
    const found = await readProjectInstructions(path.join(dir, "inner"));
    // The temp folder may sit inside some repository; this one has none of
    // its own, so at least the folder's file is there and the outer is not
    expect(found.text).toContain("inner rules");
    expect(found.text).not.toContain("outer");
  });

  it("finds nothing where there is none", async () => {
    await fs.mkdir(path.join(dir, ".git"));
    expect(await readProjectInstructions(dir)).toEqual({
      files: [],
      text: "",
      truncated: false,
    });
  });

  it("cuts a long one to fit a small model's window", async () => {
    await fs.mkdir(path.join(dir, ".git"));
    await write("AGENTS.md", "x".repeat(MAX_INSTRUCTION_CHARS + 500));
    const found = await readProjectInstructions(dir);
    expect(found.truncated).toBe(true);
    expect(found.text).toContain("read the file if you need it");
    expect(found.text.length).toBeLessThan(MAX_INSTRUCTION_CHARS + 120);
  });
});

describe("projectFacts", () => {
  it("gathers the tree, scripts, README and file types, skipping dependencies", async () => {
    await write(
      "package.json",
      JSON.stringify({
        name: "cart",
        type: "commonjs",
        scripts: { test: "node test.js" },
        dependencies: { lodash: "^4" },
      })
    );
    await write("README.md", "# Cart\nShopping cart helpers.");
    await write("src/cart.js", "module.exports = {}");
    await write("test.js", "");
    await write("node_modules/lodash/index.js", "");

    const facts = await projectFacts(dir);
    expect(facts).toContain("src/\n  cart.js");
    expect(facts).toContain("npm run test -> node test.js");
    expect(facts).toContain("dependencies: lodash");
    expect(facts).toContain("# Cart\nShopping cart helpers.");
    expect(facts).toMatch(/File types: \.js \(2\)/);
    expect(facts).not.toContain("node_modules");
  });
});
