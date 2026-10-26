// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
// The filesystem server's own edit function, to show the retry works on it
// @ts-expect-error -- the server ships no type declarations
import { applyFileEdits } from "@modelcontextprotocol/server-filesystem/dist/lib.js";
import {
  decodeEditArguments,
  decodeXmlEntities,
  missedEdit,
} from "./editEntities";

describe("decodeXmlEntities", () => {
  it("decodes the codes a model writes for quotes and brackets", () => {
    expect(
      decodeXmlEntities("Write-Host (&quot;a&quot; + &apos;b&apos;)")
    ).toBe(`Write-Host ("a" + 'b')`);
    expect(decodeXmlEntities("if (a &lt; b &amp;&amp; c &gt; d)")).toBe(
      "if (a < b && c > d)"
    );
    expect(decodeXmlEntities("&#34;x&#x27;")).toBe(`"x'`);
  });

  it("decodes once, so an escaped code stays a code", () => {
    expect(decodeXmlEntities("&amp;quot;")).toBe("&quot;");
  });

  it("leaves other ampersands and unknown codes alone", () => {
    expect(decodeXmlEntities("a & b &nbsp; &#0; &#xFFFFFFF;")).toBe(
      "a & b &nbsp; &#0; &#xFFFFFFF;"
    );
  });
});

describe("decodeEditArguments", () => {
  it("is null when no oldText has a code", () => {
    expect(
      decodeEditArguments({
        path: "a.ps1",
        edits: [{ oldText: 'Write-Host "a"', newText: "x &quot;" }],
      })
    ).toBeNull();
    expect(decodeEditArguments({ path: "a.ps1" })).toBeNull();
  });

  it("decodes every oldText and newText and keeps the other arguments", () => {
    expect(
      decodeEditArguments({
        path: "a.ps1",
        dryRun: true,
        edits: [
          {
            oldText: "Write-Host (&quot;a&quot;)",
            newText: "Write-Host (&quot;b&quot;)",
          },
          { oldText: "$x = 1", newText: "$x = &lt;2&gt;" },
        ],
      })
    ).toEqual({
      path: "a.ps1",
      dryRun: true,
      edits: [
        { oldText: 'Write-Host ("a")', newText: 'Write-Host ("b")' },
        { oldText: "$x = 1", newText: "$x = <2>" },
      ],
    });
  });
});

describe("missedEdit", () => {
  it("recognises the server's no-match error only", () => {
    const error = (text: string) => ({
      isError: true,
      content: [{ type: "text", text }],
    });
    expect(missedEdit(error("Could not find exact match for edit:\nx"))).toBe(
      true
    );
    expect(missedEdit(error("Access denied - path outside allowed"))).toBe(
      false
    );
    expect(
      missedEdit({
        content: [{ type: "text", text: "Could not find exact match" }],
      })
    ).toBe(false);
  });
});

// Seen in the app, 2026-09-27: Qwen3-Coder's edit to set-radio.ps1
describe("with the filesystem server's edit", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it("an escaped oldText misses, and matches once decoded", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "shield-edit-"));
    const file = path.join(dir, "set-radio.ps1");
    await fs.writeFile(
      file,
      '$enumRes = 0\nWrite-Host ("WlanEnumInterfaces -> res={0}" -f $enumRes)\n'
    );
    const args = {
      path: file,
      edits: [
        {
          oldText:
            "Write-Host (&quot;WlanEnumInterfaces -> res={0}&quot; -f $enumRes)",
          newText: "Write-Host (&quot;Enum -> {0}&quot; -f $enumRes)",
        },
      ],
    };

    await expect(applyFileEdits(file, args.edits)).rejects.toThrow(
      /could not find exact match/i
    );
    expect(await fs.readFile(file, "utf-8")).toContain("WlanEnumInterfaces");

    const decoded = decodeEditArguments(args) as typeof args;
    await applyFileEdits(file, decoded.edits);
    expect(await fs.readFile(file, "utf-8")).toBe(
      '$enumRes = 0\nWrite-Host ("Enum -> {0}" -f $enumRes)\n'
    );
  });
});
