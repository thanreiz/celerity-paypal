import React from "react";
import { useCountUp } from "../lib/useCountUp";

/**
 * Animated number. Counts up from its previous value to `value` with an
 * ease-out, then renders it through `format`. Reduced-motion users jump
 * straight to the number (useCountUp handles that).
 */
export default function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), duration = 650 }) {
  const shown = useCountUp(value, duration);
  return <>{format(shown)}</>;
}
