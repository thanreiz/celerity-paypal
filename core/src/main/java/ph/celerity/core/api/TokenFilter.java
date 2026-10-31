package ph.celerity.core.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Only the Node server may call the core: every /v1 request needs the shared
 * secret in x-core-token. Health checks stay open for Cloud Run.
 */
@Component
public class TokenFilter extends OncePerRequestFilter {
    private final byte[] expected;

    public TokenFilter(@Value("${CORE_TOKEN:}") String token) {
        this.expected = token.isBlank() ? null : digest(token);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/v1/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        if (expected == null) {
            deny(res, 503, "CORE_TOKEN is not configured on the core service");
            return;
        }
        String given = req.getHeader("x-core-token");
        // Compare digests so the check takes the same time whatever the input.
        if (given == null || !MessageDigest.isEqual(digest(given), expected)) {
            deny(res, 401, "core token required");
            return;
        }
        chain.doFilter(req, res);
    }

    private static void deny(HttpServletResponse res, int status, String message) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json");
        res.getWriter().write("{\"error\":\"" + message + "\"}");
    }

    private static byte[] digest(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
