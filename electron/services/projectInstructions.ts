/**
 * A project's AGENTS.md, and the facts SHIELD gathers to draft one.
 *
 * AGENTS.md is the file coding agents read for a project's instructions
 * (Codex, and others, use the same name). SHIELD reads it the way Codex
 * does (codex-rs/core/src/agents_md.rs): every AGENTS.md from the
 * repository root - the nearest folder above with .git - down to the
 * session's folder, root first. Capped, so it fits a small model's window.
 *
 * Drafting one is left to the model, but from facts SHIELD gathers itself
 * - the file tree, package.json scripts, the README, commit subjects - so a
 * small model does not explore a whole repository at 20 tokens a second
 * and guess (it described files from their names alone, 2026-09-28).
 */

import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";

export const INSTRUCTIONS_FILE = "AGENTS.md";
/** Most AGENTS.md text sent with each message: ~1.5k tokens */
export const MAX_INSTRUCTION_CHARS = 6000;

export interface ProjectInstructions {
  /** The AGENTS.md files read, root first */
  files: string[];
  text: string;
  truncated: boolean;
}

const exists = (p: string) =>
  fs.stat(p).then(
    () => true,
    () => false
  );

/** The folders from the repository root down to `folder`, root first */
async function folderChain(folder: string): Promise<string[]> {
  const chain = [path.resolve(folder)];
  for (;;) {
    const current = chain[0]!;
    if (await exists(path.join(current, ".git"))) return chain;
    const parent = path.dirname(current);
    if (parent === current) return [path.resolve(folder)]; // no repository
    chain.unshift(parent);
  }
}

export async function readProjectInstructions(
  folder: string
): Promise<ProjectInstructions> {
  const files: string[] = [];
  const parts: string[] = [];
  for (const dir of await folderChain(folder)) {
    const file = path.join(dir, INSTRUCTIONS_FILE);
    const text = await fs.readFile(file, "utf-8").catch(() => null);
    if (text === null || !text.trim()) continue;
    files.push(file);
    parts.push(text.trim());
  }
  let text =
    parts.length > 1
      ? parts.map((part, i) => `(From ${files[i]})\n${part}`).join("\n\n")
      : (parts[0] ?? "");
  const truncated = text.length > MAX_INSTRUCTION_CHARS;
  if (truncated) {
    text = `${text.slice(0, MAX_INSTRUCTION_CHARS)}\n[The rest of AGENTS.md is not shown here; read the file if you need it.]`;
  }
  return { files, text, truncated };
}

/** Folders that say nothing about a project's own code */
const SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  "target",
  "bin",
  "obj",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vscode",
]);

const MAX_TREE_LINES = 60;
const MAX_WALK_FILES = 3000;
const README_CHARS = 1500;

/** Top-level entries, and one level into each folder */
async function tree(folder: string): Promise<string[]> {
  const lines: string[] = [];
  const entries = await fs.readdir(folder, { withFileTypes: true });
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()));
  for (const entry of entries) {
    if (lines.length >= MAX_TREE_LINES) break;
    if (SKIP.has(entry.name)) continue;
    if (!entry.isDirectory()) {
      lines.push(entry.name);
      continue;
    }
    lines.push(`${entry.name}/`);
    const inner = await fs
      .readdir(path.join(folder, entry.name), { withFileTypes: true })
      .catch(() => []);
    for (const child of inner.slice(0, 12)) {
      if (SKIP.has(child.name)) continue;
      lines.push(`  ${child.name}${child.isDirectory() ? "/" : ""}`);
    }
    if (inner.length > 12) lines.push(`  ... ${inner.length - 12} more`);
  }
  return lines;
}

/** File extensions by count, for the languages used */
async function languages(folder: string): Promise<string[]> {
  const counts = new Map<string, number>();
  let seen = 0;
  const walk = async (dir: string) => {
    if (seen >= MAX_WALK_FILES) return;
    const entries = await fs
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      if (seen >= MAX_WALK_FILES) return;
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name) && !entry.name.startsWith(".")) {
          await walk(path.join(dir, entry.name));
        }
        continue;
      }
      seen++;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext) counts.set(ext, (counts.get(ext) ?? 0) + 1);
    }
  };
  await walk(folder);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([ext, n]) => `${ext} (${n})`);
}

function gitSubjects(folder: string): Promise<string[]> {
  return new Promise((resolve) =>
    execFile(
      "git",
      ["log", "-10", "--format=%s"],
      { cwd: folder, timeout: 5000, windowsHide: true },
      (error, stdout) =>
        resolve(error ? [] : stdout.split("\n").filter((l) => l.trim()))
    )
  );
}

/**
 * What SHIELD can see of a project without the model: plain text, a few
 * thousand characters at most, for the model to draft AGENTS.md from.
 */
export async function projectFacts(folder: string): Promise<string> {
  const sections: string[] = [`Project folder: ${folder}`];

  const lines = await tree(folder).catch(() => []);
  if (lines.length) sections.push(`Files and folders:\n${lines.join("\n")}`);

  const langs = await languages(folder).catch(() => []);
  if (langs.length) sections.push(`File types: ${langs.join(", ")}`);

  const pkg = await fs
    .readFile(path.join(folder, "package.json"), "utf-8")
    .then((text) => JSON.parse(text) as Record<string, unknown>)
    .catch(() => null);
  if (pkg) {
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    const deps = Object.keys((pkg.dependencies ?? {}) as object);
    const devDeps = Object.keys((pkg.devDependencies ?? {}) as object);
    sections.push(
      [
        `package.json: name ${String(pkg.name ?? "(none)")}${pkg.type ? `, type ${String(pkg.type)}` : ""}`,
        Object.keys(scripts).length
          ? `scripts:\n${Object.entries(scripts)
              .slice(0, 20)
              .map(([name, cmd]) => `  npm run ${name} -> ${cmd}`)
              .join("\n")}`
          : "no scripts",
        deps.length ? `dependencies: ${deps.slice(0, 20).join(", ")}` : "",
        devDeps.length
          ? `devDependencies: ${devDeps.slice(0, 20).join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  for (const name of ["README.md", "README", "readme.md"]) {
    const readme = await fs
      .readFile(path.join(folder, name), "utf-8")
      .catch(() => null);
    if (readme === null) continue;
    const cut = readme.length > README_CHARS;
    sections.push(
      `${name} (${cut ? `first ${README_CHARS} characters` : "whole"}):\n${readme.slice(0, README_CHARS)}`
    );
    break;
  }

  const others: string[] = [];
  for (const name of [
    "CLAUDE.md",
    ".cursorrules",
    ".github/copilot-instructions.md",
    "CONTRIBUTING.md",
  ]) {
    if (await exists(path.join(folder, name))) others.push(name);
  }
  if (others.length) {
    sections.push(`Other instruction files present: ${others.join(", ")}`);
  }

  const commits = await gitSubjects(folder);
  sections.push(
    commits.length
      ? `Recent commit subjects:\n${commits.map((s) => `  ${s}`).join("\n")}`
      : "Not a git repository, or no commits yet."
  );

  return sections.join("\n\n");
}
