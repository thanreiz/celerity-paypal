package ph.celerity.core;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import ph.celerity.core.funding.FundingEngine;
import ph.celerity.core.ledger.HashChain;
import ph.celerity.core.policy.PolicyConfig;
import ph.celerity.core.policy.PolicyEngine;
import tools.jackson.databind.json.JsonMapper;

/**
 * Every case in contracts/fixtures was answered by the Node rules
 * (server/scripts/export-contracts.mjs). The Java engines must give the same
 * answer, to the message and the centavo.
 */
class ParityTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Path FIXTURES = Path.of("..", "contracts", "fixtures");

    @TestFactory
    Stream<DynamicTest> javaMatchesNode() throws IOException {
        assertTrue(Files.isDirectory(FIXTURES), "missing " + FIXTURES.toAbsolutePath() + ": run node server/scripts/export-contracts.mjs");
        try (Stream<Path> files = Files.list(FIXTURES)) {
            List<Path> list = files.filter(p -> p.toString().endsWith(".json")).sorted().toList();
            assertTrue(list.size() >= 40, "expected the full contract set, found " + list.size());
            return list.stream().map(p -> DynamicTest.dynamicTest(p.getFileName().toString(), () -> check(p)));
        }
    }

    @SuppressWarnings("unchecked")
    private static void check(Path file) throws IOException {
        Map<String, Object> fixture = JSON.readValue(Files.readString(file), Map.class);
        Map<String, Object> in = (Map<String, Object>) fixture.get("input");
        PolicyConfig policy = PolicyConfig.forCurrency((String) in.get("currency"));
        long now = Instant.parse((String) in.get("now")).toEpochMilli();
        Object state = in.get("state");
        Object actual = switch ((String) fixture.get("op")) {
            case "policy/check-draft" -> Map.of("errors", PolicyEngine.checkDraft(state, in.get("run"), in.get("draft"), policy, now));
            case "policy/eligibility" -> PolicyEngine.eligibility(
                    state, PolicyEngine.findFamily(state, in.get("family_id")), in.get("run"), policy, now);
            case "policy/run-totals" -> PolicyEngine.runTotals(in.get("run"));
            case "funding/allocate" -> FundingEngine.allocateRun(state, in.get("run"));
            case "funding/balances" -> FundingEngine.poolBalances(state);
            case "ledger/verify" -> HashChain.verifyChain(in.get("events"));
            default -> throw new IllegalArgumentException("unknown op " + fixture.get("op"));
        };
        Object normalized = JSON.readValue(JSON.writeValueAsString(actual), Object.class);
        String diff = diff("$", fixture.get("expected"), normalized);
        if (diff != null) fail(fixture.get("name") + ": " + diff + "\n  expected " + fixture.get("expected") + "\n  actual   " + normalized);
    }

    /** JSON equality where numbers compare by value and a missing key equals null (JS undefined is dropped). */
    private static String diff(String at, Object expected, Object actual) {
        if (expected instanceof Number e && actual instanceof Number a) {
            return e.doubleValue() == a.doubleValue() ? null : at + ": " + e + " != " + a;
        }
        if (expected instanceof Map<?, ?> e && actual instanceof Map<?, ?> a) {
            Set<Object> keys = new HashSet<>(e.keySet());
            keys.addAll(a.keySet());
            for (Object k : keys) {
                String d = diff(at + "." + k, e.get(k), a.get(k));
                if (d != null) return d;
            }
            return null;
        }
        if (expected instanceof List<?> e && actual instanceof List<?> a) {
            if (e.size() != a.size()) return at + ": " + e.size() + " items != " + a.size();
            for (int i = 0; i < e.size(); i++) {
                String d = diff(at + "[" + i + "]", e.get(i), a.get(i));
                if (d != null) return d;
            }
            return null;
        }
        return Objects.equals(expected, actual) ? null : at + ": " + expected + " != " + actual;
    }
}
