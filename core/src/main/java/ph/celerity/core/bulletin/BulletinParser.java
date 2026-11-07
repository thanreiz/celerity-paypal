package ph.celerity.core.bulletin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads the wind signals out of a PAGASA tropical cyclone bulletin without
 * an AI model. Routine bulletins are regular: "TCWS No. N" headings followed
 * by "Luzon: / Visayas: / Mindanao:" lists of provinces, sometimes narrowed
 * to "the eastern portion of X (A, B)". Anything it can't place goes to
 * {@code unparsed} and lowers {@code confidence}; that is the hand-off to an
 * AI agent. Text outside the signal blocks is never read as data, so
 * instructions smuggled into a bulletin have nothing to act on.
 */
public final class BulletinParser {
    private final Map<String, String> provinces; // lower-case alias -> official name

    public BulletinParser() {
        this.provinces = loadProvinces();
    }

    public record Area(String province, String municipality, int signal_level) {}

    public record Result(String storm, String bulletin_number, List<Area> areas, List<String> unparsed, double confidence) {}

    private static final Pattern STORM = Pattern.compile(
            "^\\s*(Super Typhoon|Typhoon|Severe Tropical Storm|Tropical Storm|Tropical Depression)\\s+[\"“]?([A-Za-z][A-Za-z-]+)[\"”]?",
            Pattern.CASE_INSENSITIVE | Pattern.MULTILINE);
    private static final Pattern NUMBER = Pattern.compile("BULLETIN\\s+(?:NR|NO)\\.?\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern SIGNAL = Pattern.compile("^\\s*TCWS\\s+No\\.?\\s*(\\d)\\b(.*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern IN_EFFECT = Pattern.compile("in effect\\s*:\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern REGION = Pattern.compile("^\\s*(Luzon|Visayas|Mindanao)\\s*:\\s*(.*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern PORTION = Pattern.compile(
            "^(?:the\\s+)?(?:[a-z-]+(?:\\s+and\\s+[a-z-]+)?\\s+)?portions?\\s+of\\s+(.+?)\\s*(?:\\((.+)\\))?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern PARENS = Pattern.compile("^(.+?)\\s*\\((.+)\\)$");
    private static final Pattern INCLUDING = Pattern.compile("^(.+?)\\s+including\\s+.+$", Pattern.CASE_INSENSITIVE);

    public Result parse(String text) {
        String body = text == null ? "" : text;
        String storm = null;
        Matcher sm = STORM.matcher(body);
        if (sm.find()) storm = titleCase(sm.group(1)) + " " + titleCase(sm.group(2));
        Matcher nm = NUMBER.matcher(body);
        String number = nm.find() ? String.valueOf(Integer.parseInt(nm.group(1))) : null;

        List<Area> areas = new ArrayList<>();
        List<String> unparsed = new ArrayList<>();
        int signal = 0;
        boolean sawSignal = false;
        for (String line : body.split("\\R")) {
            Matcher s = SIGNAL.matcher(line);
            if (s.find()) {
                sawSignal = true;
                signal = Integer.parseInt(s.group(1));
                Matcher inline = IN_EFFECT.matcher(s.group(2));
                if (inline.find()) readList(inline.group(1), signal, areas, unparsed);
                continue;
            }
            Matcher r = REGION.matcher(line);
            if (r.find() && signal > 0) {
                readList(r.group(2), signal, areas, unparsed);
                continue;
            }
            if (line.isBlank()) signal = 0; // a blank line ends a signal block
        }
        double confidence;
        if (!sawSignal) confidence = 0.0;
        else if (areas.isEmpty() && unparsed.isEmpty()) confidence = 1.0;
        else confidence = (double) countPlaces(areas) / (countPlaces(areas) + unparsed.size());
        return new Result(storm, number, areas, unparsed, Math.round(confidence * 100) / 100.0);
    }

    private static long countPlaces(List<Area> areas) {
        return areas.stream().map(a -> a.province()).distinct().count();
    }

    private void readList(String list, int signal, List<Area> areas, List<String> unparsed) {
        for (String raw : splitTopLevel(list)) {
            String item = raw.strip().replaceAll("[.;]+$", "").strip();
            if (item.isEmpty()) continue;
            String province = null;
            List<String> municipalities = List.of();

            Matcher portion = PORTION.matcher(item);
            Matcher parens = PARENS.matcher(item);
            Matcher including = INCLUDING.matcher(item);
            if (portion.matches()) {
                province = lookup(portion.group(1));
                if (portion.group(2) != null) municipalities = splitTopLevel(portion.group(2));
            } else if (parens.matches()) {
                province = lookup(parens.group(1));
                municipalities = splitTopLevel(parens.group(2));
            } else if (including.matches()) {
                province = lookup(including.group(1)); // "Masbate including Ticao and Burias Islands"
            } else {
                province = lookup(item);
            }

            if (province == null) {
                unparsed.add(item);
                continue;
            }
            if (municipalities.isEmpty()) {
                areas.add(new Area(province, null, signal));
            } else {
                for (String m : municipalities) {
                    String name = m.strip();
                    if (!name.isEmpty()) areas.add(new Area(province, name, signal));
                }
            }
        }
    }

    /** Split on commas and "and" that are not inside parentheses. */
    static List<String> splitTopLevel(String s) {
        List<String> out = new ArrayList<>();
        int depth = 0;
        StringBuilder cur = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '(') depth++;
            if (c == ')') depth = Math.max(0, depth - 1);
            if (c == ',' && depth == 0) {
                out.add(cur.toString());
                cur.setLength(0);
            } else {
                cur.append(c);
            }
        }
        out.add(cur.toString());
        // "Albay and Sorsogon" -> two items, unless "and" is part of a phrase like "Ticao and Burias Islands".
        List<String> split = new ArrayList<>();
        for (String part : out) {
            String p = part.strip().replaceFirst("(?i)^and\\s+", "");
            if (p.toLowerCase(Locale.ROOT).contains(" including ") || p.contains("(")) {
                split.add(p);
            } else {
                for (String x : p.split("(?i)\\s+and\\s+")) split.add(x);
            }
        }
        return split;
    }

    private String lookup(String name) {
        String key = name.strip().replaceFirst("(?i)^the\\s+", "").replaceFirst("(?i)\\s+province$", "").toLowerCase(Locale.ROOT);
        return provinces.get(key);
    }

    private static String titleCase(String s) {
        StringBuilder b = new StringBuilder();
        for (String w : s.toLowerCase(Locale.ROOT).split(" ")) {
            if (w.isEmpty()) continue;
            if (!b.isEmpty()) b.append(' ');
            b.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        }
        return b.toString();
    }

    private static Map<String, String> loadProvinces() {
        Map<String, String> map = new LinkedHashMap<>();
        try (var in = BulletinParser.class.getResourceAsStream("/provinces.txt");
                var reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.strip();
                if (line.isEmpty() || line.startsWith("#")) continue;
                String[] names = line.split("\\|");
                for (String n : names) map.put(n.strip().toLowerCase(Locale.ROOT), names[0].strip());
            }
        } catch (IOException | NullPointerException e) {
            throw new IllegalStateException("provinces.txt is missing from the classpath", e);
        }
        return map;
    }
}
