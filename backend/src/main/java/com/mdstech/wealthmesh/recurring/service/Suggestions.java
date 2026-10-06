package com.mdstech.wealthmesh.recurring.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.mdstech.wealthmesh.activity.repository.ActivityStore.Candidate;

/**
 * Finds monthly suggestions in recorded expenses (RECURRING_001): three or more bills of one account, one category and
 * one description (compared without case or edge spaces) about a month apart, the latest run counting. It is an
 * estimate: it does not promise that every repeated purchase can be detected, and it never writes anything.
 */
public final class Suggestions {

    /** Bills fewer days than this or more days than that apart are not a monthly pattern. */
    static final int MIN_GAP_DAYS = 26;
    static final int MAX_GAP_DAYS = 34;
    static final int MIN_BILLS = 3;

    /** One suggestion: the bills that support it, oldest first, and the key it is dismissed or matched by. */
    public record Found(UUID accountId, UUID categoryId, String description, List<Candidate> bills) {

        public Candidate latest() {
            return bills.getLast();
        }

        public String key() {
            return Suggestions.key(accountId, categoryId, description);
        }
    }

    private Suggestions() {
    }

    /** The key a schedule, a suggestion and a dismissal share: account, effective category and description. */
    public static String key(UUID accountId, UUID categoryId, String description) {
        return accountId + "|" + categoryId + "|" + description.strip().toLowerCase(Locale.ROOT);
    }

    /** The suggestions in `candidates` (any order), without the keys already scheduled or dismissed. */
    public static List<Found> find(List<Candidate> candidates, Set<String> excluded) {
        Map<String, List<Candidate>> groups = new LinkedHashMap<>();
        for (Candidate c : candidates) {
            groups.computeIfAbsent(key(c.accountId(), c.categoryId(), c.description()), k -> new ArrayList<>()).add(c);
        }
        List<Found> found = new ArrayList<>();
        groups.forEach((key, bills) -> {
            if (excluded.contains(key)) {
                return;
            }
            List<Candidate> run = latestRun(
                    bills.stream().sorted(Comparator.comparing(Candidate::occurredOn)).toList());
            if (run.size() >= MIN_BILLS) {
                Candidate last = run.getLast();
                found.add(new Found(last.accountId(), last.categoryId(), last.description().strip(), run));
            }
        });
        found.sort(Comparator.comparing((Found f) -> f.latest().occurredOn()).reversed());
        return found;
    }

    /** The newest bills each about a month after the one before, oldest first. */
    private static List<Candidate> latestRun(List<Candidate> sorted) {
        int start = sorted.size() - 1;
        while (start > 0 && monthly(sorted.get(start - 1).occurredOn(), sorted.get(start).occurredOn())) {
            start--;
        }
        return sorted.subList(start, sorted.size());
    }

    private static boolean monthly(LocalDate earlier, LocalDate later) {
        long days = ChronoUnit.DAYS.between(earlier, later);
        return days >= MIN_GAP_DAYS && days <= MAX_GAP_DAYS;
    }
}
