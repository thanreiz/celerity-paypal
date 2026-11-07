package ph.celerity.core.ledger;

import static ph.celerity.core.js.Js.get;
import static ph.celerity.core.js.Js.list;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import ph.celerity.core.js.Js;

/**
 * The evidence log's hash chain: a port of hashEntry / stableStringify /
 * verifyChain in server/src/store.js. Each entry commits to the previous
 * entry's hash, so any edit or deletion breaks verification.
 */
public final class HashChain {
    private HashChain() {}

    public static final String GENESIS = "0".repeat(64);

    /** Key-sorted JSON, byte-for-byte what stableStringify produces in Node. */
    public static String stableStringify(Object v) {
        if (v instanceof List<?> l) {
            List<String> parts = new ArrayList<>();
            for (Object x : l) parts.add(stableStringify(x));
            return "[" + String.join(",", parts) + "]";
        }
        if (v instanceof Map<?, ?> m) {
            List<String> keys = new ArrayList<>();
            for (Object k : m.keySet()) keys.add(String.valueOf(k));
            keys.sort(null); // UTF-16 code unit order, like Array.prototype.sort
            List<String> parts = new ArrayList<>();
            for (String k : keys) parts.add(Js.quote(k) + ":" + stableStringify(m.get(k)));
            return "{" + String.join(",", parts) + "}";
        }
        return Js.scalar(v);
    }

    public static String hashEntry(Object entry) {
        Map<String, Object> rest = new LinkedHashMap<>(Js.map(entry));
        rest.remove("hash");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(stableStringify(rest).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static Map<String, Object> verifyChain(Object events) {
        String prev = GENESIS;
        List<Object> list = list(events);
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < list.size(); i++) {
            Object e = list.get(i);
            String reason = null;
            if (!Objects.equals(get(e, "prevHash"), prev)) reason = "prevHash mismatch";
            else if (!Objects.equals(hashEntry(e), get(e, "hash"))) reason = "hash mismatch";
            if (reason != null) {
                out.put("ok", false);
                out.put("brokenAt", i);
                out.put("reason", reason);
                return out;
            }
            prev = String.valueOf(get(e, "hash"));
        }
        out.put("ok", true);
        out.put("length", list.size());
        out.put("head", prev);
        return out;
    }
}
