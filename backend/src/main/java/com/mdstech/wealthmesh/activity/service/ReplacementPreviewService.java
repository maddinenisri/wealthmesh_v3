package com.mdstech.wealthmesh.activity.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.dto.ReplacementPreview;
import com.mdstech.wealthmesh.activity.dto.ReplacementPreview.AccountFigure;
import com.mdstech.wealthmesh.activity.dto.ReplacementPreview.MonthFigure;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Mono;

/** Shows both accounts' Balances and both months' totals for a replacement, changing nothing. */
@Service
public class ReplacementPreviewService {

    private final AccountRepository accounts;
    private final ActivityRepository activities;
    private final ActivityStore store;
    private final MoveTarget moveTarget;

    public ReplacementPreviewService(AccountRepository accounts, ActivityRepository activities, ActivityStore store,
            MoveTarget moveTarget) {
        this.accounts = accounts;
        this.activities = activities;
        this.store = store;
        this.moveTarget = moveTarget;
    }

    public Mono<ReplacementPreview> preview(UUID accountId, UUID activityId, UUID targetId, Object amount,
            LocalDate date) {
        return Mono.fromCallable(() -> EntryValidator.amount(amount)).flatMap(newAmount -> {
            if (date == null) {
                return Mono.error(EntryValidator.bad("Enter a date"));
            }
            return activities.findById(activityId).filter(a -> accountId.equals(a.accountId())
                            && a.removedAt() == null && ("expense".equals(a.kind()) || "income".equals(a.kind())
                                    || "refund".equals(a.kind())))
                    .switchIfEmpty(Mono.error(new org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatus.NOT_FOUND, "Entry not found: " + activityId)))
                    .flatMap(original -> moveTarget.resolve(accountId, targetId)
                            .flatMap(target -> figures(original, target, newAmount, date)));
        });
    }

    private Mono<ReplacementPreview> figures(Activity original, Account target, BigDecimal amount, LocalDate date) {
        String kind = EntryChangeService.replacementKind(original);
        BigDecimal oldSigned = signed(original.kind(), original.amount());
        BigDecimal newSigned = signed(kind, amount);
        boolean same = target.id().equals(original.accountId());
        return accounts.findById(original.accountId()).flatMap(source -> Mono.zip(balance(source), balance(target))
                .flatMap(balances -> {
                    BigDecimal fromAfter = balances.getT1().subtract(oldSigned).add(same ? newSigned : BigDecimal.ZERO);
                    BigDecimal toAfter = same ? fromAfter : balances.getT2().add(newSigned);
                    YearMonth oldMonth = YearMonth.from(original.occurredOn());
                    YearMonth newMonth = YearMonth.from(date);
                    return Mono.zip(month(kind, oldMonth, oldMonth, newMonth, original.amount(), amount),
                            month(kind, newMonth, oldMonth, newMonth, original.amount(), amount))
                            .map(months -> new ReplacementPreview(
                                    new ReplacementPreview.AccountFigure(source.id(), source.name(),
                                            Money.format(fromAfter)),
                                    new AccountFigure(target.id(), target.name(), Money.format(toAfter)),
                                    months.getT1(), months.getT2()));
                }));
    }

    private Mono<BigDecimal> balance(Account account) {
        return store.deltaOf(account.id()).map(delta -> account.openingAmount().add(delta.amount()));
    }

    /** A month's total now and after: the old entry leaves its month, the new one joins its own. */
    private Mono<MonthFigure> month(String kind, YearMonth month, YearMonth oldMonth, YearMonth newMonth,
            BigDecimal oldAmount, BigDecimal newAmount) {
        // A refund lowers spending, so its effect on the month figure is the opposite of an expense's.
        BigDecimal direction = "refund".equals(kind) ? BigDecimal.ONE.negate() : BigDecimal.ONE;
        String counted = "income".equals(kind) ? kind : "expense";
        Mono<BigDecimal> total = store.monthTotal(counted, month.atDay(1), month.plusMonths(1).atDay(1));
        return total.map(before -> {
            BigDecimal after = before;
            if (month.equals(oldMonth)) {
                after = after.subtract(oldAmount.multiply(direction));
            }
            if (month.equals(newMonth)) {
                after = after.add(newAmount.multiply(direction));
            }
            return new MonthFigure(month.toString(), "income".equals(kind) ? "income" : "spending",
                    Money.format(before), Money.format(after));
        });
    }

    private static BigDecimal signed(String kind, BigDecimal amount) {
        return "expense".equals(kind) ? amount.negate() : amount;
    }
}
