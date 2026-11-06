package ph.celerity.core.funding;

import static ph.celerity.core.js.Js.cents;
import static ph.celerity.core.js.Js.get;
import static ph.celerity.core.js.Js.list;
import static ph.celerity.core.js.Js.norm;
import static ph.celerity.core.js.Js.num;
import static ph.celerity.core.js.Js.str;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import ph.celerity.core.policy.PolicyConfig;
import ph.celerity.core.policy.PolicyEngine;

/**
 * Funders' earmarked pools: a port of server/src/funding.js. Every payout is
 * split across the pools that cover the family, pro-rata by what each has
 * left. Balances are computed from contributions and allocations, never stored.
 */
public final class FundingEngine {
    private FundingEngine() {}

    /** Pools that cover a family: earmarked for its province, or nationwide. */
    public static List<Object> poolsFor(Object state, Object family) {
        return poolsFor(state, family, null);
    }

    /**
     * With a signal, only pools whose funder's rule pays at that signal or
     * higher (a pool without min_signal pays at any signal policy allows).
     */
    public static List<Object> poolsFor(Object state, Object family, Integer signal) {
        List<Object> out = new ArrayList<>();
        if (family == null) return out;
        String province = norm(get(family, "province"));
        for (Object p : list(get(state, "pools"))) {
            List<Object> provinces = list(get(p, "provinces"));
            boolean covers = provinces.isEmpty() || provinces.stream().anyMatch(x -> norm(x).equals(province));
            if (covers && (signal == null || signal >= minSignal(p))) out.add(p);
        }
        return out;
    }

    private static int minSignal(Object pool) {
        Object v = get(pool, "min_signal");
        return v instanceof Number n && Double.isFinite(n.doubleValue()) ? (int) n.doubleValue() : 0;
    }

    /** The signal a draft is paid under: from the run's areas when it has them, else none. */
    private static Integer draftSignal(Object family, Object run) {
        Object areas = get(run, "areas");
        return family != null && areas instanceof List<?> ? PolicyEngine.signalFor(family, areas) : null;
    }

    /** Balances per pool in centavos: [contributed, committed]. */
    private static Map<String, long[]> balanceCents(Object state) {
        Map<String, long[]> c = new LinkedHashMap<>();
        for (Object p : list(get(state, "pools"))) c.put(str(get(p, "id")), new long[2]);
        for (Object k : list(get(state, "contributions"))) {
            long[] b = c.get(str(get(k, "pool_id")));
            if ("completed".equals(get(k, "status")) && b != null) b[0] += cents(get(k, "amount"));
        }
        for (Object batch : list(get(state, "batches"))) {
            for (Object it : list(get(batch, "items"))) {
                if (PolicyEngine.NOT_PAID.contains(str(get(it, "status")))) continue;
                for (Object f : list(get(it, "funding"))) {
                    long[] b = c.get(str(get(f, "pool_id")));
                    if (b != null) b[1] += cents(get(f, "amount"));
                }
            }
        }
        return c;
    }

    /** { pool_id: { contributed, committed, available } } in pesos. */
    public static Map<String, Object> poolBalances(Object state) {
        Map<String, Object> out = new LinkedHashMap<>();
        balanceCents(state).forEach((id, b) -> {
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("contributed", b[0] / 100.0);
            v.put("committed", b[1] / 100.0);
            v.put("available", (b[0] - b[1]) / 100.0);
            out.put(id, v);
        });
        return out;
    }

    /** Split each draft across the pools that cover its family, in draft order. */
    public static Map<String, Object> allocateRun(Object state, Object run) {
        Map<String, Long> left = new LinkedHashMap<>();
        balanceCents(state).forEach((id, b) -> left.put(id, b[0] - b[1]));
        Map<String, Object> allocations = new LinkedHashMap<>();
        List<Object> shortfalls = new ArrayList<>();

        for (Object d : list(get(run, "drafts"))) {
            Object family = PolicyEngine.findFamily(state, get(d, "family_id"));
            List<String> pools = new ArrayList<>();
            for (Object p : poolsFor(state, family, draftSignal(family, run))) {
                String id = str(get(p, "id"));
                if (left.getOrDefault(id, 0L) > 0) pools.add(id);
            }
            long want = cents(get(d, "amount"));
            long have = pools.stream().mapToLong(left::get).sum();
            if (want > have) {
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("family_id", get(d, "family_id"));
                s.put("province", family == null ? null : get(family, "province"));
                s.put("short", (want - have) / 100.0);
                s.put("available", have / 100.0);
                shortfalls.add(s);
                continue;
            }
            // Floor each share, then hand leftover centavos one by one to the
            // pools with the most room, so no pool goes below zero.
            long[] shares = new long[pools.size()];
            long given = 0;
            for (int i = 0; i < pools.size(); i++) {
                shares[i] = have == 0 ? 0 : (want * left.get(pools.get(i))) / have;
                given += shares[i];
            }
            for (long rest = want - given; rest > 0; rest--) {
                int roomiest = 0;
                for (int i = 1; i < pools.size(); i++) {
                    if (left.get(pools.get(i)) - shares[i] > left.get(pools.get(roomiest)) - shares[roomiest]) roomiest = i;
                }
                shares[roomiest] += 1;
            }
            List<Object> split = new ArrayList<>();
            for (int i = 0; i < pools.size(); i++) {
                if (shares[i] > 0) {
                    Map<String, Object> s = new LinkedHashMap<>();
                    s.put("pool_id", pools.get(i));
                    s.put("amount", shares[i] / 100.0);
                    split.add(s);
                }
                left.put(pools.get(i), left.get(pools.get(i)) - shares[i]);
            }
            allocations.put(str(get(d, "family_id")), split);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("allocations", allocations);
        out.put("shortfalls", shortfalls);
        return out;
    }

    /** Why the pools can't fund this draft alongside the run's other drafts, or null. */
    @SuppressWarnings("unchecked")
    public static String fundingProblem(Object state, Object run, Object draft, PolicyConfig policy) {
        List<Object> drafts = PolicyEngine.otherDrafts(run, get(draft, "family_id"));
        drafts.add(draft);
        Map<String, Object> scoped = new LinkedHashMap<>();
        scoped.put("areas", get(run, "areas"));
        scoped.put("drafts", drafts);
        Map<String, Object> result = allocateRun(state, scoped);
        Map<String, Object> s = null;
        for (Object x : (List<Object>) result.get("shortfalls")) {
            if (Objects.equals(get(x, "family_id"), get(draft, "family_id"))) {
                s = (Map<String, Object>) x;
                break;
            }
        }
        if (s == null) return null;
        Object family = PolicyEngine.findFamily(state, get(draft, "family_id"));
        if (family == null) return null; // eligibility already reports an unknown family
        if (poolsFor(state, family).isEmpty()) return "no funding pool covers " + str(get(family, "province"));
        Integer signal = draftSignal(family, run);
        if (poolsFor(state, family, signal).isEmpty()) {
            return "no funding pool covers " + str(get(family, "province")) + " at signal " + signal;
        }
        return "funding pools for " + str(get(family, "province")) + " have only "
                + num((double) s.get("available")) + " " + policy.currency() + " left for this run";
    }
}
