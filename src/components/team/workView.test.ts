import { describe, expect, it } from "vitest";
import { displayCommand, displayPath, exitCodeIsItsOwn } from "./workView";

describe("displayCommand", () => {
  it("drops the cd, the folded errors and the echoed exit code", () => {
    expect(
      displayCommand(
        'cd /home/me/Projects/app && python3 -m unittest discover -v 2>&1; echo "EXIT_CODE=$?"'
      )
    ).toBe("python3 -m unittest discover -v");
    expect(displayCommand('cd "C:\\Users\\me\\app"; npm test')).toBe(
      "npm test"
    );
  });

  it("leaves a plain command as it is", () => {
    expect(displayCommand("git status")).toBe("git status");
  });

  it("shortens a full path inside the command", () => {
    expect(displayCommand("python3 /home/me/Projects/app/test_words.py")).toBe(
      "python3 app/test_words.py"
    );
  });
});

describe("displayPath", () => {
  it("keeps the last two segments", () => {
    expect(displayPath("/home/me/app/src/a.ts")).toBe("src/a.ts");
    expect(displayPath("a.ts")).toBe("a.ts");
  });
});

describe("piped commands", () => {
  it("drops a tail or head that only cuts the output", () => {
    expect(displayCommand("python3 -m unittest -v 2>&1 | tail -40")).toBe(
      "python3 -m unittest -v"
    );
  });

  it("knows a piped exit code is not the command's own", () => {
    expect(exitCodeIsItsOwn("python3 -m pytest -q | tail -40")).toBe(false);
    expect(exitCodeIsItsOwn("npm test || echo failed")).toBe(true);
    expect(exitCodeIsItsOwn("grep -n 'a|b' file.py")).toBe(true);
    expect(exitCodeIsItsOwn("python3 -m unittest")).toBe(true);
  });
});
