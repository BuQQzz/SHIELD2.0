import { describe, expect, it } from "vitest";
import { isDeletingCommand } from "./deletingCommand";

describe("isDeletingCommand", () => {
  it.each([
    "rm -rf build",
    "cd app && rm old.txt",
    "ls; /bin/rm x",
    "sudo rm -r /tmp/x",
    "find . -name '*.pyc' -delete",
    "find . -name '*.log' -exec rm {} +",
    "ls *.tmp | xargs rm",
    "rmdir empty",
    "git clean -fd",
    "git rm src/old.py",
    "git reset --hard HEAD~1",
    "git checkout -- src/a.py",
    "git restore .",
    "git branch -D feature",
    "git stash drop",
    "python3 -c \"import os; os.remove('a.txt')\"",
    "python3 -c 'import shutil; shutil.rmtree(\"build\")'",
    "node -e \"require('fs').rmSync('dist', {recursive: true})\"",
  ])("asks for %s", (command) => {
    expect(isDeletingCommand(command, "linux")).toBe(true);
  });

  it.each([
    "python3 -m unittest discover -s tests",
    "grep -rn remove src",
    "npm run build",
    "git status && git diff",
    "git checkout -b feature",
    "git restore --staged a.py b.py",
    "sed -n '1,80p' kanban/storage.py",
    "mv a.txt b.txt",
    "echo trimmed > notes.txt",
    "cat farm.txt",
    "curl -s localhost:8765/health",
  ])("runs %s", (command) => {
    expect(isDeletingCommand(command, "linux")).toBe(false);
  });

  it("knows PowerShell's deletes on Windows", () => {
    expect(isDeletingCommand("Remove-Item -Recurse dist", "windows")).toBe(
      true
    );
    expect(isDeletingCommand("Get-ChildItem; del a.txt", "windows")).toBe(true);
    expect(isDeletingCommand("Get-Content a.txt", "windows")).toBe(false);
  });
});
