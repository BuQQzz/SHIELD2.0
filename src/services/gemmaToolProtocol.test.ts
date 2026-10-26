// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseGemmaToolCall } from "./gemmaToolProtocol";

const string = (value: string) => `<|"|>${value}<|"|>`;
const call = (params: string, name = "filesystem__write_file") =>
  `<|tool_call>call:${name}{${params}}<tool_call|>`;

describe("parseGemmaToolCall", () => {
  it("parses native strings verbatim and preserves prefix and complete raw call", () => {
    const content =
      'first line\nsecond line: {commas, braces} and "ordinary quotes"';
    const raw = call(
      `path:${string("C:\\work\\note.txt")},content:${string(content)}`
    );
    expect(parseGemmaToolCall(`I will write that file.\n${raw}\r\n `)).toEqual({
      name: "filesystem__write_file",
      params: { path: "C:\\work\\note.txt", content },
      prefix: "I will write that file.\n",
      raw,
    });
  });

  it("parses nested edit objects, arrays, JSON numbers and explicit nulls", () => {
    const raw = call(
      `
      path: ${string("C:/work/example.txt")},
      edits: [{oldText:${string("before")},newText:${string("after")}}, {}],
      dryRun: false,
      metadata: {present:true,value:null,numbers:[0,-0,-12,1.25,2e3,-1.2E-2],empty:[]}
    `,
      "filesystem__edit_file"
    );
    const result = parseGemmaToolCall(raw);
    expect(result?.params).toEqual({
      path: "C:/work/example.txt",
      edits: [{ oldText: "before", newText: "after" }, {}],
      dryRun: false,
      metadata: {
        present: true,
        value: null,
        numbers: [0, -0, -12, 1.25, 2000, -0.012],
        empty: [],
      },
    });
    expect(result?.name).toBe("filesystem__edit_file");
  });

  it("allows tool boundary tokens inside native quoted strings", () => {
    const content =
      "Examples: <|tool_call>call:fake{}<tool_call|> and }], next:false";
    expect(
      parseGemmaToolCall(call(`content:${string(content)}`))?.params
    ).toEqual({ content });
  });

  it("preserves prototype-like own keys without invoking inherited setters", () => {
    const result = parseGemmaToolCall(
      call(
        "__proto__:{polluted:true},constructor:{prototype:{polluted:true}},toString:null"
      )
    );
    expect(Object.getPrototypeOf(result!.params)).toBe(Object.prototype);
    expect(
      Object.prototype.hasOwnProperty.call(result!.params, "__proto__")
    ).toBe(true);
    expect(result!.params.__proto__).toEqual({ polluted: true });
    expect(result!.params.toString).toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")
    ).toBe(false);
  });

  it("leaves normal responses alone and accepts empty arguments", () => {
    expect(parseGemmaToolCall("There are no tool calls here.")).toBeNull();
    expect(
      parseGemmaToolCall(call("", "filesystem__list_allowed_directories"))
        ?.params
    ).toEqual({});
  });

  it.each([
    ["missing call prefix", "<|tool_call>"],
    ["missing argument close", '<|tool_call>call:read{path:<|"|>x<|"|>'],
    ["missing native closer", "<|tool_call>call:read{}"],
    ["unterminated string", '<|tool_call>call:read{path:<|"|>x}<tool_call|>'],
    ["invalid function name", call("", "filesystem.read")],
    ["invalid initial function character", call("", "1read")],
    ["invalid key", call("file-path:null")],
    ["quoted key", call('"path":null')],
    ["JSON string instead of native string", call('path:"x"')],
    ["executable expression", call("path:process.exit()")],
    ["undefined literal", call("value:undefined")],
    ["capitalized boolean", call("value:True")],
    ["trailing object comma", call("value:null,")],
    ["trailing array comma", call("value:[true,]")],
    ["missing comma", call("a:true b:false")],
    ["duplicate key", call("path:null,path:false")],
    ["duplicate nested key", call("data:{x:1,x:2}")],
    ["number with leading zero", call("value:01")],
    ["invalid fractional number", call("value:1.")],
    ["incomplete exponent", call("value:1e")],
    ["nonfinite number", call("value:1e9999")],
    ["trailing prose", `${call("")}done`],
    ["multiple calls", `${call("")}\n${call("")}`],
  ])(
    "rejects %s rather than returning executable arguments",
    (_label, text) => {
      expect(() => parseGemmaToolCall(text)).toThrow(
        /^Invalid Gemma tool call:/
      );
    }
  );

  it("bounds depth and input size with errors that do not leak argument contents", () => {
    const allowedNesting = call(`data:${"[".repeat(63)}null${"]".repeat(63)}`);
    expect(parseGemmaToolCall(allowedNesting)).not.toBeNull();
    expect(() =>
      parseGemmaToolCall(call(`data:${"[".repeat(64)}null${"]".repeat(64)}`))
    ).toThrow("nesting exceeds 64 containers");
    expect(() =>
      parseGemmaToolCall(call(`data:${string("x".repeat(1024 * 1024))}`))
    ).toThrow("input exceeds");
    const secret = "SENSITIVE_ARGUMENT_VALUE";
    try {
      parseGemmaToolCall(call(`data:${secret}`));
      throw new Error("Parser accepted invalid data");
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message.length).toBeLessThan(200);
    }
  });
});
