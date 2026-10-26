/**
 * Animated Count
 *
 * A number that runs up to each new value instead of jumping. Token counts
 * arrive in bursts - llama-server reports its reading once per 2,048-token
 * batch - and a running count reads as progress rather than flicker.
 */

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

const plain = (n: number) => n.toLocaleString("en-US");

interface AnimatedCountProps {
  value: number;
  /** Keep it stable (a module-level function): it is read once */
  format?: (n: number) => string;
}

export function AnimatedCount({ value, format = plain }: AnimatedCountProps) {
  const count = useMotionValue(value);
  const text = useTransform(count, (n) => format(Math.round(n)));

  useEffect(() => {
    const controls = animate(count, value, { duration: 0.4, ease: "easeOut" });
    return () => controls.stop();
  }, [count, value]);

  return <motion.span className="tabular-nums">{text}</motion.span>;
}
