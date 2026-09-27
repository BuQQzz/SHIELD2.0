/** A tool result returned through SHIELD's permission-controlled tool loop. */
export interface NativeToolResult {
  callId: string;
  /** Bounded, untrusted-data-wrapped result, including refusals and failures. */
  result: string;
}
