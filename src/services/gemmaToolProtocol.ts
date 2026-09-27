const TOOL_START = "<|tool_call>";
const TOOL_END = "<tool_call|>";
const STRING_DELIMITER = '<|"|>';
const MAX_INPUT_CHARS = 1024 * 1024;
const MAX_CONTAINER_DEPTH = 64;

export interface GemmaToolCall {
  name: string;
  params: Record<string, unknown>;
  /** Text generated before the native call token. */
  prefix: string;
  /** The complete native call, including both boundary tokens. */
  raw: string;
}

/**
 * Parse Gemma's native argument syntax without evaluating generated code.
 * Strings use <|"|> delimiters and preserve their contents verbatim, including
 * backslashes, newlines, braces and tool boundary tokens.
 */
export function parseGemmaToolCall(text: string): GemmaToolCall | null {
  const start = text.indexOf(TOOL_START);
  if (start < 0) return null;
  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(
      "Invalid Gemma tool call: input exceeds the 1 MiB character limit."
    );
  }
  const parser = new GemmaArgumentsParser(text, start);
  parser.expect(TOOL_START);
  parser.expect("call:");
  const name = parser.identifier("function name");
  parser.whitespace();
  const params = parser.object(1);
  parser.whitespace();
  parser.expect(TOOL_END);
  const end = parser.position;
  parser.whitespace();
  if (parser.position !== text.length) {
    parser.fail("unexpected content after the tool call");
  }
  return {
    name,
    params,
    prefix: text.slice(0, start),
    raw: text.slice(start, end),
  };
}

class GemmaArgumentsParser {
  position: number;
  private readonly identifierPattern = /[A-Za-z_][A-Za-z0-9_]*/y;
  private readonly numberPattern =
    /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

  constructor(
    private readonly text: string,
    private readonly start: number
  ) {
    this.position = start;
  }

  fail(reason: string): never {
    // Error text deliberately excludes model-generated names, keys and values.
    throw new Error(
      `Invalid Gemma tool call: ${reason} at character ${this.position - this.start}.`
    );
  }

  whitespace(): void {
    while (" \t\r\n".includes(this.text[this.position] ?? "\0"))
      this.position++;
  }

  expect(token: string): void {
    if (!this.text.startsWith(token, this.position)) {
      this.fail(`expected ${token}`);
    }
    this.position += token.length;
  }

  identifier(label: string): string {
    this.identifierPattern.lastIndex = this.position;
    const match = this.identifierPattern.exec(this.text);
    if (!match) this.fail(`expected ${label}`);
    this.position = this.identifierPattern.lastIndex;
    return match[0];
  }

  object(depth: number): Record<string, unknown> {
    this.checkDepth(depth);
    this.expect("{");
    this.whitespace();
    const entries: [string, unknown][] = [];
    const keys = new Set<string>();
    if (this.text[this.position] === "}") {
      this.position++;
      return {};
    }
    while (true) {
      const key = this.identifier("object key");
      if (keys.has(key)) this.fail("duplicate object key");
      keys.add(key);
      this.whitespace();
      this.expect(":");
      this.whitespace();
      entries.push([key, this.value(depth)]);
      this.whitespace();
      if (this.text[this.position] === "}") {
        this.position++;
        // Object.fromEntries defines own data properties, including __proto__,
        // without invoking Object.prototype setters.
        return Object.fromEntries(entries);
      }
      this.expect(",");
      this.whitespace();
    }
  }

  private array(depth: number): unknown[] {
    this.checkDepth(depth);
    this.expect("[");
    this.whitespace();
    const values: unknown[] = [];
    if (this.text[this.position] === "]") {
      this.position++;
      return values;
    }
    while (true) {
      values.push(this.value(depth));
      this.whitespace();
      if (this.text[this.position] === "]") {
        this.position++;
        return values;
      }
      this.expect(",");
      this.whitespace();
    }
  }

  private value(parentDepth: number): unknown {
    if (this.text.startsWith(STRING_DELIMITER, this.position)) {
      const start = this.position + STRING_DELIMITER.length;
      const end = this.text.indexOf(STRING_DELIMITER, start);
      if (end < 0) this.fail("unterminated string");
      this.position = end + STRING_DELIMITER.length;
      return this.text.slice(start, end);
    }
    const first = this.text[this.position];
    if (first === "{") return this.object(parentDepth + 1);
    if (first === "[") return this.array(parentDepth + 1);
    for (const [literal, value] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (this.text.startsWith(literal, this.position)) {
        this.position += literal.length;
        return value;
      }
    }
    this.numberPattern.lastIndex = this.position;
    const match = this.numberPattern.exec(this.text);
    if (match) {
      const value = Number(match[0]);
      if (!Number.isFinite(value))
        this.fail("number is outside the finite range");
      this.position = this.numberPattern.lastIndex;
      return value;
    }
    this.fail("expected a string, number, boolean, null, array or object");
  }

  private checkDepth(depth: number): void {
    if (depth > MAX_CONTAINER_DEPTH) this.fail("nesting exceeds 64 containers");
  }
}
