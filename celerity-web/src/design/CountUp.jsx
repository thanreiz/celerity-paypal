import React from "react";
import { useCountUp } from "../lib/useCountUp";
import { phpValue, toPHP } from "../lib/anchor";

/**
 * Animated peso amount. Counts up from its previous value to `units` with an
 * ease-out, then formats. Reduced-motion users jump straight to the number
 * (useCountUp handles that). `format="value"` renders "₱1,234" (for contexts
 * that already show a ₱), `format="full"` renders the localized currency.
 * Pass `placeholder` to render a static string while data is still loading.
 */
export default function CountUp({ units, format = "value", placeholder, duration = 650 }) {
  if (placeholder != null) return <>{placeholder}</>;
  return <Animated units={units} format={format} duration={duration} />;
}

function Animated({ units, format, duration }) {
  const n = useCountUp(Number(units) || 0, duration);
  return <>{format === "full" ? toPHP(n) : phpValue(n)}</>;
}
