/**
 * The definitions in a code file - functions, classes, types - as the
 * model would grep for them: the line's text and its line number
 */

/** A line that defines something in Python, JS/TS, Go, Rust or a shell */
export const DEFINITION =
  /^\s*(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:def|class|function\*?|interface|type|enum|func|fn|struct|impl)\s+[\w$]+|(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>|[\w-]+\s*\(\)\s*\{)/;

/** Files whose reads are code, for the big-read outline */
export const CODE_FILE =
  /\.(py|pyw|js|jsx|mjs|cjs|ts|tsx|go|rs|rb|java|kt|cs|cpp|cc|c|h|hpp|php|swift|sh|bash|ps1|lua)$/i;

export interface OutlineLine {
  line: number;
  text: string;
}

/** Each definition in `text`, numbered from `firstLine` */
export function outline(text: string, firstLine = 1): OutlineLine[] {
  const found: OutlineLine[] = [];
  text.split("\n").forEach((line, i) => {
    if (DEFINITION.test(line)) {
      found.push({
        line: firstLine + i,
        text: line.trim().replace(/\s*[{:]\s*$/, "").slice(0, 90),
      });
    }
  });
  return found;
}
