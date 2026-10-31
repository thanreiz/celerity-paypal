package ph.celerity.core.api;

import static ph.celerity.core.js.Js.get;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ph.celerity.core.bulletin.BulletinParser;
import ph.celerity.core.funding.FundingEngine;
import ph.celerity.core.ledger.HashChain;
import ph.celerity.core.policy.PolicyConfig;
import ph.celerity.core.policy.PolicyEngine;

/**
 * The deterministic core over HTTP. Every endpoint is stateless: the caller
 * (the Node server) sends the slice of state the rule needs and gets the
 * answer back. Nothing here calls an AI model or moves money.
 */
@RestController
@RequestMapping("/v1")
public class CoreController {
    private final String defaultCurrency;
    private final BulletinParser parser = new BulletinParser();

    public CoreController(@Value("${PAYOUT_CURRENCY:USD}") String defaultCurrency) {
        this.defaultCurrency = defaultCurrency;
    }

    private PolicyConfig policy(Map<String, Object> body) {
        Object c = body.get("currency");
        return PolicyConfig.forCurrency(c instanceof String s ? s : defaultCurrency);
    }

    /** "now" is optional so tests and replays are reproducible. */
    private static long now(Map<String, Object> body) {
        Object n = body.get("now");
        if (n instanceof String s) {
            try {
                return Instant.parse(s).toEpochMilli();
            } catch (RuntimeException e) {
                throw new IllegalArgumentException("now must be an ISO-8601 instant");
            }
        }
        return System.currentTimeMillis();
    }

    @PostMapping("/policy/check-draft")
    public Map<String, Object> checkDraft(@RequestBody Map<String, Object> body) {
        return Map.of("errors", PolicyEngine.checkDraft(body.get("state"), body.get("run"), body.get("draft"), policy(body), now(body)));
    }

    @PostMapping("/policy/eligibility")
    public Map<String, Object> eligibility(@RequestBody Map<String, Object> body) {
        Object family = PolicyEngine.findFamily(body.get("state"), body.get("family_id"));
        return PolicyEngine.eligibility(body.get("state"), family, body.get("run"), policy(body), now(body));
    }

    @PostMapping("/policy/run-totals")
    public Map<String, Object> runTotals(@RequestBody Map<String, Object> body) {
        return PolicyEngine.runTotals(body.get("run"));
    }

    @PostMapping("/funding/allocate")
    public Map<String, Object> allocate(@RequestBody Map<String, Object> body) {
        return FundingEngine.allocateRun(body.get("state"), body.get("run"));
    }

    @PostMapping("/funding/balances")
    public Map<String, Object> balances(@RequestBody Map<String, Object> body) {
        return FundingEngine.poolBalances(body.get("state"));
    }

    @PostMapping("/ledger/verify")
    public Map<String, Object> verify(@RequestBody Map<String, Object> body) {
        return HashChain.verifyChain(body.get("events"));
    }

    @PostMapping("/bulletins/parse")
    public BulletinParser.Result parse(@RequestBody Map<String, Object> body) {
        Object text = get(body, "text");
        if (!(text instanceof String s)) throw new IllegalArgumentException("text must be a string");
        if (s.length() > 20_000) throw new IllegalArgumentException("bulletin text is too long");
        return parser.parse(s);
    }

    @PostMapping("/ping")
    public Map<String, Object> ping() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("currency", defaultCurrency);
        return out;
    }
}
