import { describe, expect, it } from "vitest";
import { outsideFolderPath } from "./useMCPDialogs";

const fs = (args: Record<string, unknown>) => ({
  serverName: "filesystem",
  arguments: args,
});
const folder = "/home/user/Projects/spend";

describe("outsideFolderPath", () => {
  it("names a file tool's path outside the session folder (g11 step 1)", () => {
    expect(outsideFolderPath(fs({ path: "/tmp/spendtest" }), folder)).toBe(
      "/tmp/spendtest"
    );
    expect(
      outsideFolderPath(
        fs({ source: `${folder}/a.py`, destination: "/home/user/a.py" }),
        folder
      )
    ).toBe("/home/user/a.py");
    expect(outsideFolderPath(fs({ path: "~/.spend/data.json" }), folder)).toBe(
      "~/.spend/data.json"
    );
  });

  it("lets paths in the folder, relative paths, other servers and chats through", () => {
    expect(
      outsideFolderPath(fs({ path: `${folder}/spend.py` }), folder)
    ).toBeNull();
    expect(outsideFolderPath(fs({ path: "spend.py" }), folder)).toBeNull();
    expect(
      outsideFolderPath(
        { serverName: "terminal", arguments: { path: "/tmp/x" } },
        folder
      )
    ).toBeNull();
    expect(outsideFolderPath(fs({ path: "/tmp/x" }), undefined)).toBeNull();
  });
});
