package ph.celerity.core.policy;

import java.util.Locale;
import java.util.Map;

/** Hard payout limits per payout currency. Same numbers as AMOUNTS in server/src/policy.js. */
public record PolicyConfig(
        String currency,
        int minSignal,
        int maxRecipientsPerRun,
        Map<Integer, Long> signalBase,
        long perExtraMember,
        long householdTopUpCap,
        long vulnerabilityTopUp,
        long maxPerFamily,
        long maxPerRun) {

    private static final PolicyConfig USD = new PolicyConfig(
            "USD", 2, 40, Map.of(1, 0L, 2, 20L, 3, 40L, 4, 60L, 5, 80L), 5, 20, 10, 120, 1500);
    private static final PolicyConfig PHP = new PolicyConfig(
            "PHP", 2, 40, Map.of(1, 0L, 2, 1000L, 3, 2000L, 4, 3000L, 5, 4000L), 250, 1000, 500, 6000, 75000);

    public static PolicyConfig forCurrency(String currency) {
        String c = currency == null || currency.isBlank() ? "USD" : currency.toUpperCase(Locale.ROOT);
        return switch (c) {
            case "USD" -> USD;
            case "PHP" -> PHP;
            default -> throw new IllegalArgumentException(
                    "PAYOUT_CURRENCY \"" + c + "\" has no policy amounts; use one of USD, PHP");
        };
    }
}
