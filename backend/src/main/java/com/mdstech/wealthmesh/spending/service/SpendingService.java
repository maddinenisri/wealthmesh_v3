package com.mdstech.wealthmesh.spending.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.activity.dto.ActivityResponse;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.spending.dto.MonthReview;
import com.mdstech.wealthmesh.spending.dto.SpendingHistory;
import com.mdstech.wealthmesh.spending.dto.SpendingSummary;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Spending is the sum of expenses in a month and income the sum of income; transfers, payments and corrections are
 * neither. The month review sets them side by side.
 */
@Service
public class SpendingService {

    private static final BigDecimal TWELVE = BigDecimal.valueOf(12);

    private final ActivityStore store;
    private final Clock clock;

    public SpendingService(ActivityStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    public Mono<SpendingSummary> summary(String month) {
        return summary("expense", month);
    }

    public Mono<SpendingSummary> incomeSummary(String month) {
        return summary("income", month);
    }

    public Flux<ActivityResponse> entries(String month, UUID categoryId) {
        return entries("expense", month, categoryId);
    }

    public Flux<ActivityResponse> incomeEntries(String month, UUID categoryId) {
        return entries("income", month, categoryId);
    }

    /** Income, spending and the difference for one month. */
    public Mono<MonthReview> review(String month) {
        return Mono.zip(incomeSummary(month), summary(month)).map(totals -> {
            BigDecimal income = Money.parse(totals.getT1().total()).orElseThrow();
            BigDecimal spending = Money.parse(totals.getT2().total()).orElseThrow();
            return new MonthReview(totals.getT1().month(), Money.format(income), Money.format(spending),
                    Money.format(income.subtract(spending)));
        });
    }

    private Mono<SpendingSummary> summary(String kind, String month) {
        return Mono.fromCallable(() -> parse(month)).flatMap(ym -> store
                .totalsByCategory(kind, ym.atDay(1), ym.plusMonths(1).atDay(1)).collectList()
                .map(rows -> new SpendingSummary(ym.toString(),
                        Money.format(rows.stream().map(r -> r.total()).reduce(BigDecimal.ZERO, BigDecimal::add)),
                        rows.stream().map(r -> new SpendingSummary.CategorySpending(r.categoryId(), r.name(),
                                Money.format(r.total()), r.count())).toList())));
    }

    private Flux<ActivityResponse> entries(String kind, String month, UUID categoryId) {
        return Mono.fromCallable(() -> parse(month)).flatMapMany(
                ym -> store.monthEntries(kind, ym.atDay(1), ym.plusMonths(1).atDay(1), categoryId));
    }

    public Mono<SpendingHistory> history() {
        return store.spendingByMonth().collectList().map(rows -> {
            Map<String, BigDecimal> totals = new HashMap<>();
            rows.forEach(r -> totals.put(r.month(), r.total()));
            List<SpendingHistory.Month> months = new ArrayList<>();
            if (!rows.isEmpty()) {
                YearMonth last = YearMonth.now(clock);
                for (YearMonth m = YearMonth.parse(rows.getFirst().month()); !m.isAfter(last); m = m.plusMonths(1)) {
                    BigDecimal total = totals.get(m.toString());
                    months.add(new SpendingHistory.Month(m.toString(),
                            Money.format(total == null ? BigDecimal.ZERO : total), total != null));
                }
            }
            if (rows.isEmpty()) {
                return new SpendingHistory(months, 0, null, null);
            }
            BigDecimal sum = rows.stream().map(r -> r.total()).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal n = BigDecimal.valueOf(rows.size());
            return new SpendingHistory(months, rows.size(),
                    Money.format(sum.divide(n, 2, RoundingMode.HALF_EVEN)),
                    Money.format(sum.multiply(TWELVE).divide(n, 2, RoundingMode.HALF_EVEN)));
        });
    }

    private static YearMonth parse(String month) {
        try {
            return YearMonth.parse(month);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a month like 2026-09");
        }
    }
}
