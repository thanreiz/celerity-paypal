package ph.celerity.core.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/** The HTTP surface: the token gate, a few endpoints, and error answers. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {"CORE_TOKEN=test-token", "PAYOUT_CURRENCY=PHP"})
class CoreApiTest {
    @LocalServerPort
    int port;

    private final HttpClient http = HttpClient.newHttpClient();

    private HttpResponse<String> post(String path, String token, String body) throws Exception {
        var req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null) req.header("x-core-token", token);
        return http.send(req.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void everyRuleNeedsTheSharedToken() throws Exception {
        assertEquals(401, post("/v1/ping", null, "{}").statusCode());
        assertEquals(401, post("/v1/ping", "wrong", "{}").statusCode());
        var ok = post("/v1/ping", "test-token", "{}");
        assertEquals(200, ok.statusCode());
        assertTrue(ok.body().contains("\"currency\":\"PHP\""));
    }

    @Test
    void healthIsOpenForCloudRun() throws Exception {
        var res = http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/actuator/health")).build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, res.statusCode());
    }

    @Test
    void parsesABulletin() throws Exception {
        var res = post("/v1/bulletins/parse", "test-token", "{\"text\":\"Typhoon ESTER\\nTCWS No. 2 in effect: Albay\"}");
        assertEquals(200, res.statusCode());
        assertTrue(res.body().contains("\"province\":\"Albay\""), res.body());
        assertTrue(res.body().contains("\"signal_level\":2"), res.body());
    }

    @Test
    void checksADraftInThePayoutCurrency() throws Exception {
        String body = """
                {"state":{"families":[{"id":"f1","municipality":"Virac","province":"Catanduanes","household_size":2,
                  "status":"active","paypal_email":"a@b.c"}],"batches":[],"pools":[{"id":"p","provinces":[]}],
                  "contributions":[{"pool_id":"p","amount":1000,"status":"completed"}]},
                 "run":{"storm":"Typhoon Ester","areas":[{"province":"Catanduanes","municipality":null,"signal_level":2}],"drafts":[]},
                 "draft":{"family_id":"f1","amount":1500}}
                """;
        var res = post("/v1/policy/check-draft", "test-token", body);
        assertEquals(200, res.statusCode());
        assertTrue(res.body().contains("amount 1500 exceeds this family's policy cap of 1000"), res.body());
    }

    @Test
    void badInputGetsAPlainAnswer() throws Exception {
        var notJson = post("/v1/policy/check-draft", "test-token", "{\"state\":");
        assertEquals(400, notJson.statusCode());
        assertTrue(notJson.body().contains("not valid JSON"));
        var badCurrency = post("/v1/policy/check-draft", "test-token", "{\"currency\":\"EUR\"}");
        assertEquals(400, badCurrency.statusCode());
        assertTrue(badCurrency.body().contains("has no policy amounts"));
    }
}
