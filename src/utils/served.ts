/**
 * What to say under a hosted model's reply about who served it and whether
 * that route keeps a copy of the request. The provider's own report, shown as
 * such: it is the gateway's reading of its providers' terms, not a signed
 * guarantee.
 */

export interface ServedBy {
  /** The provider that answered, e.g. "bedrock" */
  provider?: string;
  zdr?: boolean;
}

export interface ServedLabel {
  text: string;
  title: string;
  tone: "good" | "warn" | "unknown";
}

export function servedLabel(servedBy: ServedBy): ServedLabel {
  const who = servedBy.provider || "cloud";
  if (servedBy.zdr === true) {
    return {
      text: `${who} · zero retention`,
      title: `Served by ${who}. The gateway reports that this route keeps no copy of the request (its own reading of the provider's terms, not a signed guarantee).`,
      tone: "good",
    };
  }
  if (servedBy.zdr === false) {
    return {
      text: `${who} · may keep data`,
      title: `Served by ${who}. The gateway reports that this route may keep a copy of the request.`,
      tone: "warn",
    };
  }
  return {
    text: `${who} · retention not reported`,
    title: `Served by ${who}. The provider did not say whether it keeps a copy of the request.`,
    tone: "unknown",
  };
}
