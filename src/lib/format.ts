/** 312 -> "312", 8_192 -> "8.2k", 262_144 -> "262k" */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  const k = count / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
}
