import { resultPayload } from "./mcpToolHandler";

/** A file as it is now, read through the filesystem server; null when it cannot be read */
export async function readProjectFile(path: string): Promise<string | null> {
  const result = await window.electronAPI?.mcp?.callTool({
    serverName: "filesystem",
    tool: "read_text_file",
    arguments: { path },
  });
  if (!result?.success || (result.data as { isError?: unknown })?.isError) {
    return null;
  }
  return resultPayload(result.data);
}
