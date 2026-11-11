import { describe, expect, it } from "vitest";
import { changedCodeFile, filesRun, runReminder } from "./runReminder";

describe("run reminder (g28 step 17)", () => {
  it("notes successful writes and edits of code files only", () => {
    expect(changedCodeFile("edit_file", { path: "/p/spend.py" }, true)).toBe("spend.py");
    expect(changedCodeFile("write_file", { path: "/p/app.js" }, true)).toBe("app.js");
    expect(changedCodeFile("edit_file", { path: "/p/spend.py" }, false)).toBeNull();
    expect(changedCodeFile("edit_file", { path: "/p/README.md" }, true)).toBeNull();
    expect(changedCodeFile("read_text_file", { path: "/p/spend.py" }, true)).toBeNull();
  });

  it("counts a run of the file, an import of it, or a test runner", () => {
    const changed = ["spend.py"];
    expect(filesRun("cd /p && python3 spend.py list", changed)).toEqual(["spend.py"]);
    expect(filesRun(`cd /tmp/t && python3 -c "import spend; spend.main()"`, changed)).toEqual(["spend.py"]);
    expect(filesRun("cd /p && python3 -m pytest -q", changed)).toEqual(["spend.py"]);
    expect(filesRun("cd /p && python3 -m py_compile spend.py && python3 spend.py summary", changed)).toEqual(["spend.py"]);
  });

  it("does not count reading, searching or a syntax check", () => {
    const changed = ["spend.py"];
    expect(filesRun("cd /p && python3 -m py_compile spend.py && echo OK", changed)).toEqual([]);
    expect(filesRun("cd /p && grep -n 'def export' spend.py", changed)).toEqual([]);
    expect(filesRun("sed -n '1,40p' /p/spend.py", changed)).toEqual([]);
    expect(filesRun("node --check app.js", ["app.js"])).toEqual([]);
    expect(filesRun("python3 other.py", changed)).toEqual([]);
  });

  it("names the files and leaves room for a user who said not to run it", () => {
    const text = runReminder(["spend.py"]);
    expect(text).toContain("you changed spend.py");
    expect(text).toContain("throwaway data");
    expect(text).toContain("If the user asked you not to run it");
  });
});
