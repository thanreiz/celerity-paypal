package ph.celerity.core.policy;

import static ph.celerity.core.js.Js.cents;
import static ph.celerity.core.js.Js.get;
import static ph.celerity.core.js.Js.list;
import static ph.celerity.core.js.Js.norm;
import static ph.celerity.core.js.Js.num;
import static ph.celerity.core.js.Js.number;
import static ph.celerity.core.js.Js.str;
import static ph.celerity.core.js.Js.truthy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import ph.celerity.core.funding.FundingEngine;

/**
 * Hard payout limits: a port of server/src/policy.js. The agent proposes;
 * this decides. State, runs and drafts are the JSON the Node server keeps,
 * read with JS semantics so both implementations agree to the message.
 */
public final class PolicyEngine {
    private PolicyEngine() {}

    public static final List<String> VULNERABILITY_FLAGS = List.of("senior", "pwd", "infant", "pregnant");

    /** Item states where no money reached the family, so a retry is allowed. */
    public static final Set<String> NOT_PAID =
            Set.of("FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED", "CANCELED");

    public static final int COOLDOWN_DAYS = 7;

    private static final Pattern BRACKETS = Pattern.compile("[(\\[{].*?[)\\]}]");
    private static final Pattern CATEGORY =
            Pattern.compile("^\\s*(super\\s+)?(typhoon|tropical storm|severe tropical storm|tropical depression)\\s+");
    private static final Pattern NOT_LETTERS = Pattern.compile("[^\\p{L}]+");

    /** "Typhoon Dalisay", "DALISAY" and "Super Typhoon Dalisay (Haikui)" are one storm. */
    public static String stormKey(Object name) {
        String s = BRACKETS.matcher(norm(name)).replaceAll(" ");
        s = CATEGORY.matcher(s).replaceFirst("");
        return NOT_LETTERS.matcher(s).replaceAll("");
    }

    /** Highest signal covering the family's location, or 0. A null municipality covers the whole province. */
    public static int signalFor(Object family, Object areas) {
        double best = 0;
        for (Object a : list(areas)) {
            if (!norm(get(a, "province")).equals(norm(get(family, "province")))) continue;
            Object muni = get(a, "municipality");
            if (truthy(muni) && !norm(muni).equals(norm(get(family, "municipality")))) continue;
            double level = number(get(a, "signal_level"));
            best = Math.max(best, Double.isNaN(level) ? 0 : level);
        }
        return (int) best;
    }

    public static long maxAmountFor(Object family, int signal, PolicyConfig policy) {
        long base = policy.signalBase().getOrDefault(signal, 0L);
        if (base == 0) return 0;
        Object size = get(family, "household_size");
        double household = truthy(size) ? number(size) : 1;
        long extraMembers = (long) Math.max(0, household - 2);
        long topUp = Math.min(policy.householdTopUpCap(), extraMembers * policy.perExtraMember());
        Object vuln = get(family, "vulnerability");
        long flags = VULNERABILITY_FLAGS.stream().filter(f -> truthy(get(vuln, f))).count();
        return Math.min(policy.maxPerFamily(), base + topUp + flags * policy.vulnerabilityTopUp());
    }

    /** Families already paid (or in flight) for this storm. */
    public static Set<String> paidFamilyIds(Object state, Object storm) {
        String key = stormKey(storm);
        Set<String> ids = new LinkedHashSet<>();
        if (key.isEmpty()) return ids;
        for (Object b : list(get(state, "batches"))) {
            if (!stormKey(get(b, "storm")).equals(key)) continue;
            for (Object it : list(get(b, "items"))) {
                if (!NOT_PAID.contains(str(get(it, "status")))) ids.add(str(get(it, "family_id")));
            }
        }
        return ids;
    }

    /** Families paid (or in flight) in the last COOLDOWN_DAYS for any storm. */
    public static Set<String> recentlyPaidIds(Object state, long nowMillis) {
        Set<String> ids = new LinkedHashSet<>();
        for (Object b : list(get(state, "batches"))) {
            double created = parseDate(get(b, "created_at"));
            // Date.parse of a missing date is NaN, and NaN > x is false: such a batch counts as recent.
            if (nowMillis - created > COOLDOWN_DAYS * 86_400_000L) continue;
            for (Object it : list(get(b, "items"))) {
                if (!NOT_PAID.contains(str(get(it, "status")))) ids.add(str(get(it, "family_id")));
            }
        }
        return ids;
    }

    private static double parseDate(Object v) {
        if (!(v instanceof String s)) return Double.NaN;
        try {
            return Instant.parse(s).toEpochMilli();
        } catch (RuntimeException e) {
            return Double.NaN;
        }
    }

    public static Map<String, Object> eligibility(Object state, Object family, Object run, PolicyConfig policy, long nowMillis) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (family == null) {
            out.put("eligible", false);
            out.put("max_amount", 0L);
            out.put("signal", 0);
            out.put("reasons", List.of("unknown family_id"));
            return out;
        }
        List<String> reasons = new ArrayList<>();
        if (!"active".equals(get(family, "status"))) reasons.add("registration status is " + str(get(family, "status")));
        if (!truthy(get(family, "paypal_email"))) reasons.add("no PayPal email on file");
        int signal = signalFor(family, get(run, "areas"));
        if (signal < policy.minSignal()) {
            reasons.add(signal == 0
                    ? str(get(family, "municipality")) + ", " + str(get(family, "province")) + " is not under any wind signal in this bulletin"
                    : "signal " + signal + " is below the minimum of " + policy.minSignal());
        }
        String familyId = str(get(family, "id"));
        if (stormKey(get(run, "storm")).isEmpty()) reasons.add("the run has no storm name yet");
        else if (paidFamilyIds(state, get(run, "storm")).contains(familyId)) reasons.add("already paid for " + str(get(run, "storm")));
        else if (recentlyPaidIds(state, nowMillis).contains(familyId)) reasons.add("already paid in the last " + COOLDOWN_DAYS + " days");
        long max = reasons.isEmpty() ? maxAmountFor(family, signal, policy) : 0;
        out.put("eligible", reasons.isEmpty());
        out.put("max_amount", max);
        out.put("signal", signal);
        out.put("reasons", reasons);
        return out;
    }

    public static Object findFamily(Object state, Object familyId) {
        for (Object f : list(get(state, "families"))) {
            if (java.util.Objects.equals(get(f, "id"), familyId)) return f;
        }
        return null;
    }

    /** Violations of one draft against policy and the run's other drafts (empty = OK). */
    public static List<String> checkDraft(Object state, Object run, Object draft, PolicyConfig policy, long nowMillis) {
        Object family = findFamily(state, get(draft, "family_id"));
        Map<String, Object> el = eligibility(state, family, run, policy, nowMillis);
        @SuppressWarnings("unchecked")
        List<String> errors = new ArrayList<>((List<String>) el.get("reasons"));
        double amount = number(get(draft, "amount"));
        boolean finite = Double.isFinite(amount);
        long maxAmount = (long) el.get("max_amount");
        if (!finite || amount <= 0) errors.add("amount must be a positive number");
        else if (Math.abs(amount * 100 - cents(amount)) > 1e-6) errors.add("amount has more than 2 decimals");
        else if ((boolean) el.get("eligible") && amount > maxAmount) {
            errors.add("amount " + num(amount) + " exceeds this family's policy cap of " + maxAmount);
        }
        List<Object> others = otherDrafts(run, get(draft, "family_id"));
        if (others.size() + 1 > policy.maxRecipientsPerRun()) {
            errors.add("run would exceed " + policy.maxRecipientsPerRun() + " recipients");
        }
        long totalCents = others.stream().mapToLong(d -> cents(get(d, "amount"))).sum() + (finite ? cents(amount) : 0);
        double total = totalCents / 100.0;
        if (total > policy.maxPerRun()) errors.add("run total " + num(total) + " would exceed the per-run cap of " + policy.maxPerRun());
        if (errors.isEmpty()) {
            Map<String, Object> withAmount = new LinkedHashMap<>(ph.celerity.core.js.Js.map(draft));
            withAmount.put("amount", amount);
            String unfunded = FundingEngine.fundingProblem(state, run, withAmount, policy);
            if (unfunded != null) errors.add(unfunded);
        }
        return errors;
    }

    public static List<Object> otherDrafts(Object run, Object familyId) {
        List<Object> out = new ArrayList<>();
        for (Object d : list(get(run, "drafts"))) {
            if (!java.util.Objects.equals(get(d, "family_id"), familyId)) out.add(d);
        }
        return out;
    }

    public static Map<String, Object> runTotals(Object run) {
        List<Object> drafts = list(get(run, "drafts"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("recipients", drafts.size());
        out.put("amount", drafts.stream().mapToLong(d -> cents(get(d, "amount"))).sum() / 100.0);
        return out;
    }
}
