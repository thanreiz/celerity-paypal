package ph.celerity.core.js;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * JavaScript value semantics for state that arrives as JSON (maps, lists,
 * strings, numbers, booleans, null). The rules were written in JS first and
 * both implementations must give identical answers, so the engines read
 * values the way JS does: truthiness, Number(), String(), and how a number
 * prints inside a message.
 */
public final class Js {
    private Js() {}

    @SuppressWarnings("unchecked")
    public static Map<String, Object> map(Object v) {
        return v instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    @SuppressWarnings("unchecked")
    public static List<Object> list(Object v) {
        return v instanceof List<?> l ? (List<Object>) l : List.of();
    }

    public static Object get(Object obj, String key) {
        return obj instanceof Map<?, ?> m ? m.get(key) : null;
    }

    /** JS truthiness for JSON values. */
    public static boolean truthy(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) {
            double d = n.doubleValue();
            return d != 0 && !Double.isNaN(d);
        }
        if (v instanceof String s) return !s.isEmpty();
        return true;
    }

    /** JS Number(v) for JSON values. */
    public static double number(Object v) {
        if (v == null) return 0;
        if (v instanceof Number n) return n.doubleValue();
        if (v instanceof Boolean b) return b ? 1 : 0;
        if (v instanceof String s) {
            String t = s.strip();
            if (t.isEmpty()) return 0;
            try {
                return Double.parseDouble(t);
            } catch (NumberFormatException e) {
                return Double.NaN;
            }
        }
        return Double.NaN;
    }

    /** JS String(v) for the values the rules print. */
    public static String str(Object v) {
        if (v == null) return "undefined";
        if (v instanceof Number n) return num(n.doubleValue());
        return String.valueOf(v);
    }

    /** JS String(v || ""). */
    public static String strOrEmpty(Object v) {
        return truthy(v) ? str(v) : "";
    }

    /** norm() in policy.js: String(s || "").trim().toLowerCase(). */
    public static String norm(Object v) {
        return strOrEmpty(v).strip().toLowerCase(Locale.ROOT);
    }

    /** How JS prints a number in a template string (70, 19.99, 0.3). */
    public static String num(double d) {
        if (Double.isNaN(d)) return "NaN";
        if (Double.isInfinite(d)) return d > 0 ? "Infinity" : "-Infinity";
        if (d == Math.rint(d) && Math.abs(d) < 1e21) return Long.toString((long) d);
        return new BigDecimal(Double.toString(d)).stripTrailingZeros().toPlainString();
    }

    /** Whole centavos: cents() in policy.js, Math.round(Number(x) * 100). */
    public static long cents(Object amount) {
        return Math.round(number(amount) * 100);
    }

    /** JSON.stringify for one string. */
    public static String quote(String s) {
        StringBuilder b = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\b' -> b.append("\\b");
                case '\f' -> b.append("\\f");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    boolean lone = Character.isSurrogate(c)
                            && !(Character.isHighSurrogate(c) && i + 1 < s.length() && Character.isLowSurrogate(s.charAt(i + 1)))
                            && !(Character.isLowSurrogate(c) && i > 0 && Character.isHighSurrogate(s.charAt(i - 1)));
                    if (c < 0x20 || lone) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
                }
            }
        }
        return b.append('"').toString();
    }

    /** JSON.stringify for a scalar JSON value. */
    public static String scalar(Object v) {
        if (v == null) return "null";
        if (v instanceof String s) return quote(s);
        if (v instanceof Boolean b) return b.toString();
        if (v instanceof Number n) {
            double d = n.doubleValue();
            return Double.isFinite(d) ? num(d) : "null";
        }
        return quote(v.toString());
    }
}
