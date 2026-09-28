import { describe, expect, it } from "vitest";
import { isReadOnlyCommand, scriptsInCommand } from "./commandSafety";

describe("isReadOnlyCommand", () => {
  it.each([
    "git status",
    "git diff",
    "git diff --stat HEAD~1",
    "git log --oneline -n 20",
    "git log main..HEAD",
    "git --no-pager log -5",
    "git show HEAD",
    "git blame set-radio.ps1",
    "git grep -n TODO",
    "git branch",
    "git branch -a -v",
    "git branch --list 'feat*'",
    "git remote -v",
    "git stash list",
    "git --version",
    "Get-ChildItem",
    "ls",
    "dir -Recurse -Filter *.ps1",
    "Get-Content set-radio.ps1",
    "Get-Content .\\src\\app.js -TotalCount 40",
    "cat ./README.md",
    'Select-String -Path *.ps1 -Pattern "WlanFreeData"',
    "Get-ChildItem -Recurse -Include *.ps1 | Select-String -Pattern 'TODO|FIXME'",
    "Get-ChildItem | Sort-Object Length | Select-Object -First 5",
    "Test-Path package.json",
    "npm ls",
    "node --version",
    "python --version",
  ])("runs %s", (command) => {
    expect(isReadOnlyCommand(command)).toBe(true);
  });

  it.each([
    ["an empty command", ""],
    ["a test run", "npm test"],
    ["a script", ".\\set-radio.ps1"],
    ["a program in the folder", "./build.sh"],
    ["removing a file", "Remove-Item x.txt"],
    ["writing a file", "Set-Content x.txt hi"],
    ["a second command", "git status; Remove-Item x"],
    ["a chained command", "git status && npm test"],
    ["an or-chain", "git status || npm test"],
    ["a background job", "git status &"],
    ["a redirect", "git log > log.txt"],
    ["a variable", "Get-Content $env:USERPROFILE\\secret.txt"],
    ["a subexpression", "Get-Item (Remove-Item x)"],
    ["a script block", "Get-ChildItem | ForEach-Object { Remove-Item $_ }"],
    ["a method called on each item", "Get-ChildItem | ForEach-Object Delete"],
    ["the % alias", "ls | % Delete"],
    ["a splat", "Get-Content @args"],
    ["a line break", "git status\nRemove-Item x"],
    ["a Unicode line break", "git status\u2028Remove-Item x"],
    ["a tab", "git\tstatus"],
    ["a drive path", "Get-Content C:\\Windows\\win.ini"],
    ["a provider path", "Get-ChildItem Env:"],
    ["the registry", "Get-ChildItem HKCU:\\Software"],
    ["a rooted path", "Get-Content \\Windows\\win.ini"],
    ["a UNC path", "Get-Content \\\\server\\share\\x"],
    ["the home folder", "Get-Content ~\\.ssh\\id_rsa"],
    ["the parent folder", "Get-Content ..\\other\\secret.txt"],
    ["a climb inside a path", "Get-ChildItem src\\..\\..\\"],
    ["an open quote", "Select-String -Pattern 'x"],
    ["a trailing pipe", "git status |"],
    ["an unknown program piped in", "git log | Out-File log.txt"],
    ["a git global option", "git -c core.pager=less log"],
    ["git -C elsewhere", "git -C other status"],
    ["git diff to a file", "git diff --output=patch.diff"],
    ["git's external diff", "git diff --ext-diff"],
    ["grep's pager", "git grep -O TODO"],
    ["a new branch", "git branch feature"],
    ["deleting a branch", "git branch -D main"],
    ["a commit", "git commit -m x"],
    ["a checkout", "git checkout main"],
    ["a reset", "git reset --hard"],
    ["a new remote", "git remote add x y"],
    ["a stash", "git stash"],
    ["npm install", "npm install"],
    ["a version bump", "npm version patch"],
    ["a program given more than --version", "node --version app.js"],
  ])("asks for %s", (_label, command) => {
    expect(isReadOnlyCommand(command)).toBe(false);
  });
});

describe("scriptsInCommand", () => {
  it("finds the scripts a command names, as written", () => {
    expect(
      scriptsInCommand(
        "powershell -ExecutionPolicy Bypass -File integration-test.ps1"
      )
    ).toEqual(["integration-test.ps1"]);
    expect(
      scriptsInCommand(". .\\set-radio.ps1; node 'scripts/build.js'")
    ).toEqual([".\\set-radio.ps1", "scripts/build.js"]);
    expect(scriptsInCommand("& .\\run.ps1 | Select-Object -First 5")).toEqual([
      ".\\run.ps1",
    ]);
  });

  it("finds none in a command that runs no script file", () => {
    expect(scriptsInCommand("npm test")).toEqual([]);
    expect(scriptsInCommand("git diff -- '*.ps1'")).toEqual([]);
  });
});
