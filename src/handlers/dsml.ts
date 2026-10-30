/**
 * DeepSeek's own tool-call markup, read as SHIELD's
 *
 * SHIELD asks every model to write a call as
 * `<tool_call><server>..</server><tool>..</tool><arguments>{..}</arguments></tool_call>`.
 * A DeepSeek model was trained on another markup, and a hosted one (reached
 * through an API that does not turn it into structured calls for us) slips
 * into it: `<｜｜DSML｜｜ invoke name="write_file">` with one
 * `<｜｜DSML｜｜ parameter name="path" string="true">` per argument. The call
 * never ran and the markup sat in the chat as text (deepseek-v4.1-flash-1017
 * through Experiential, 2026-10-26). It also mixes the two: a SHIELD call
 * whose `</tool>` came out as a closing DSML tag. And it sometimes puts the
 * server in the invoke's name with the tool in a value-less parameter -
 * `<invoke name="filesystem">` then `<parameter name="list_directory_with_sizes">`
 * - before the real arguments (2026-10-29).
 *
 * `normaliseDsml` rewrites both into the call SHIELD already reads, so
 * running, showing and previewing a call need nothing else. The bars are the
 * fullwidth ｜ (U+FF5C) or plain |, once or twice, and a space may follow them.
 */

const BARS = "[｜|]+";
/** `<`, optional `/`, the DSML marker, then the tag's name and its attributes */
const TAG_START = `<\\s*(\\/?)\\s*${BARS}\\s*DSML\\s*${BARS}\\s*`;

const INVOKE = new RegExp(
  `<\\s*${BARS}\\s*DSML\\s*${BARS}\\s*invoke\\s+name\\s*=\\s*"([^"]+)"\\s*>([\\s\\S]*?)<\\s*\\/\\s*${BARS}\\s*DSML\\s*${BARS}\\s*invoke\\s*>`,
  "g"
);
const PARAMETER = new RegExp(
  `<\\s*${BARS}\\s*DSML\\s*${BARS}\\s*parameter\\s+name\\s*=\\s*"([^"]+)"([^>]*)>([\\s\\S]*?)<\\s*\\/\\s*${BARS}\\s*DSML\\s*${BARS}\\s*parameter\\s*>`,
  "g"
);
/** The wrapper around a set of calls, and any other DSML tag left over */
const ANY_TAG = new RegExp(`${TAG_START}[A-Za-z_]*[^>]*>`, "g");
/** A DSML closing tag where a SHIELD one belongs: `<tool>name</｜｜DSML｜｜ x>` */
const STRAY_CLOSER = `<\\s*\\/\\s*${BARS}\\s*DSML\\s*${BARS}\\s*[A-Za-z_]*\\s*>`;
/**
 * The tool given as a parameter with no value, followed by the first real
 * argument: `<parameter name="list_directory_with_sizes">` then
 * `<parameter name="path" ...>`. Some replies put the server in the invoke's
 * name and the tool here.
 */
const BARE_TOOL = new RegExp(
  `^\\s*<\\s*${BARS}\\s*DSML\\s*${BARS}\\s*parameter\\s+name\\s*=\\s*"([^"]+)"[^>]*>\\s*` +
    `(?=<\\s*${BARS}\\s*DSML\\s*${BARS}\\s*parameter\\s+name\\s*=)`
);
const CORRUPT_NAME = new RegExp(
  `(<(server|tool)>[^<\\n]*?)\\s*${STRAY_CLOSER}`,
  "g"
);
const CORRUPT_ARGUMENTS = new RegExp(
  `(<arguments>[\\s\\S]*?)\\s*${STRAY_CLOSER}(\\s*<\\/tool_call>)`,
  "g"
);

/**
 * The server of a tool whose name alone is given: the file tools are the
 * default, the rest live on SHIELD's own servers.
 */
const SERVER_OF: Record<string, string> = {
  run_command: "terminal",
  update_plan: "plan",
  web_search: "web",
  fetch_page: "web",
  search_memory: "memory",
  open_memory: "memory",
  delegate: "agents",
};

function argumentValue(attributes: string, raw: string): unknown {
  // string="false": the value is JSON (a number, a list, an object)
  if (/string\s*=\s*"false"/i.test(attributes)) {
    try {
      return JSON.parse(raw.trim());
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * The server and tool a call's bare name names: the file tools are the
 * default, the rest live on SHIELD's own servers, and a dotted
 * "agents.delegate" carries its own server.
 */
export function splitToolCallName(name: string): {
  server: string;
  tool: string;
} {
  const dot = name.indexOf(".");
  if (dot > 0) {
    return { server: name.slice(0, dot), tool: name.slice(dot + 1) };
  }
  return { server: SERVER_OF[name] ?? "filesystem", tool: name };
}

function toToolCall(name: string, body: string): string {
  const args: Record<string, unknown> = {};
  for (const match of body.matchAll(PARAMETER)) {
    const [, key, attributes = "", raw = ""] = match;
    if (key) args[key] = argumentValue(attributes, raw);
  }
  const { server, tool } = splitToolCallName(name);
  return (
    `<tool_call>\n<server>${server}</server>\n<tool>${tool}</tool>\n` +
    `<arguments>${JSON.stringify(args)}</arguments>\n</tool_call>`
  );
}

/** Whether the text holds any DSML markup, cheaply: it is asked per token */
export function hasDsml(content: string): boolean {
  return content.includes("DSML");
}

/**
 * The content with DeepSeek's markup read as SHIELD's calls. A call still
 * being written (no closing tag yet) is left as it is.
 */
export function normaliseDsml(content: string): string {
  if (!hasDsml(content)) return content;
  return (
    content
      // A SHIELD call whose closing tag came out in DSML
      .replace(CORRUPT_NAME, "$1</$2>")
      .replace(CORRUPT_ARGUMENTS, "$1</arguments>$2")
      // A whole call in DeepSeek's markup
      .replace(INVOKE, (_whole, name: string, body: string) => {
        // The server in the invoke's name and the tool in a value-less
        // parameter: read it as <server>.<tool> (deepseek-v4.1-flash, 10-29)
        const bare = body.match(BARE_TOOL);
        if (bare?.[1]) {
          return toToolCall(`${name}.${bare[1]}`, body.slice(bare[0].length));
        }
        return toToolCall(name, body);
      })
      // The wrapper around the calls
      .replace(new RegExp(`${TAG_START}(?:function_)?calls\\s*>`, "gi"), "")
  );
}

/** The content without any DSML tag left in it (for showing the user) */
export function withoutDsmlTags(content: string): string {
  if (!hasDsml(content)) return content;
  return (
    content
      .replace(ANY_TAG, "")
      // A tag the reply stopped in the middle of
      .replace(new RegExp(`<\\s*\\/?\\s*${BARS}\\s*DSML[^>]*$`), "")
      .trimEnd()
  );
}
