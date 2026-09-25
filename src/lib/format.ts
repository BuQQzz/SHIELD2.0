/** 312 -> "312", 8_192 -> "8.2k", 262_144 -> "262k" */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  const k = count / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
}

/**
 * Memory in binary gigabytes, as Task Manager counts them:
 * "12 GB", "0.8 GB"
 */
export function formatGB(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return `${gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10} GB`;
}
