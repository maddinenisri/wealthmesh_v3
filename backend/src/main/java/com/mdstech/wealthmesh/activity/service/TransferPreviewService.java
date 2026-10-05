package com.mdstech.wealthmesh.activity.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.dto.ReplacementPreview.AccountFigure;
import com.mdstech.wealthmesh.activity.dto.ReplacementPreview.MonthFigure;
import com.mdstech.wealthmesh.activity.dto.TransferPreview;
import com.mdstech.wealthmesh.activity.service.MovementService.MovementKind;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.repository.MovementStore;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * The Balances a transfer would leave, before anything is saved: for a new transfer, for the correction of an
 * existing one ({@code movementId}) and for an expense that becomes a transfer ({@code activityId}). Informational;
 * the save recomputes under the account locks (D-028).
 */
@Service
public class TransferPreviewService {

    private final AccountRepository accounts;
    private final ActivityRepository activities;
    private final ActivityStore store;
    private final MovementStore movements;

    public TransferPreviewService(AccountRepository accounts, ActivityRepository activities, ActivityStore store,
            MovementStore movements) {
        this.accounts = accounts;
        this.activities = activities;
        this.store = store;
        this.movements = movements;
    }

    public Mono<TransferPreview> preview(MovementKind kind, UUID fromId, UUID toId, Object amount, LocalDate on,
            UUID movementId, UUID activityId) {
        if (fromId == null || toId == null) {
            return Mono.error(EntryValidator.bad("Choose both accounts"));
        }
        if (fromId.equals(toId)) {
            return Mono.error(EntryValidator.bad("Choose a different account"));
        }
        return expense(fromId, activityId).map(java.util.Optional::of).defaultIfEmpty(java.util.Optional.empty())
                .flatMap(original -> {
                    if (original.isEmpty() && on == null) {
                        return Mono.error(EntryValidator.bad("Enter a date"));
                    }
                    BigDecimal newAmount = original.map(Activity::amount)
                            .orElseGet(() -> EntryValidator.amount(amount));
                    return figures(kind, fromId, toId, newAmount, movementId, original.orElse(null));
                });
    }

    /** The expense that would become a transfer: live, on the source account, and an expense. */
    private Mono<Activity> expense(UUID fromId, UUID activityId) {
        return activityId == null ? Mono.empty()
                : activities.findById(activityId).filter(a -> "expense".equals(a.kind()) && a.removedAt() == null
                        && fromId.equals(a.accountId()))
                        .switchIfEmpty(Mono.error(notFound("Entry not found: " + activityId)));
    }

    private Mono<TransferPreview> figures(MovementKind kind, UUID fromId, UUID toId, BigDecimal amount,
            UUID movementId, Activity expense) {
        // What leaves each account before the new rows are added: the old pair, or the expense.
        Map<UUID, BigDecimal> adjust = new LinkedHashMap<>();
        if (expense != null) {
            adjust.merge(expense.accountId(), expense.amount(), BigDecimal::add);
        }
        return accountOf(fromId).zipWith(accountOf(toId)).flatMap(pair -> refuse(kind, pair.getT1(), pair.getT2())
                .then(Mono.defer(() -> oldRows(kind, movementId, adjust)))
                .then(Mono.defer(() -> {
                    adjust.merge(pair.getT1().id(), amount.negate(), BigDecimal::add);
                    adjust.merge(pair.getT2().id(), amount, BigDecimal::add);
                    return Flux.fromIterable(adjust.keySet()).concatMap(this::accountOf)
                            .concatMap(account -> balance(account).map(now -> new AccountFigure(account.id(),
                                    account.name(), Money.format(now.add(adjust.get(account.id()))))))
                            .collectList().flatMap(figures -> spending(expense, amount)
                                    .map(month -> new TransferPreview(figures, month.orElse(null))));
                })));
    }

    /** Takes the old pair's effect out of each account it touched, source side first. */
    private Mono<Void> oldRows(MovementKind kind, UUID movementId, Map<UUID, BigDecimal> adjust) {
        if (movementId == null) {
            return Mono.empty();
        }
        return movements.legs(movementId).collectList()
                .filter(legs -> legs.size() == 2 && legs.stream().anyMatch(leg -> kind.outKind().equals(leg.kind())))
                .switchIfEmpty(Mono.error(notFound("Transfer not found: " + movementId)))
                .filter(legs -> legs.stream().allMatch(leg -> leg.removedAt() == null))
                .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.CONFLICT,
                        "This transfer was already changed or removed.")))
                .doOnNext(legs -> legs.reversed().forEach(leg -> adjust.merge(leg.accountId(),
                        kind.inKind().equals(leg.kind()) ? leg.amount().negate() : leg.amount(), BigDecimal::add)))
                .then();
    }

    private Mono<java.util.Optional<MonthFigure>> spending(Activity original, BigDecimal amount) {
        if (original == null) {
            return Mono.just(java.util.Optional.empty());
        }
        YearMonth month = YearMonth.from(original.occurredOn());
        return store.monthTotal("expense", month.atDay(1), month.plusMonths(1).atDay(1))
                .map(before -> java.util.Optional.of(new MonthFigure(month.toString(), "spending",
                        Money.format(before), Money.format(before.subtract(amount)))));
    }

    private Mono<Account> accountOf(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(notFound("Account not found: " + id)))
                .filter(account -> AccountType.holdsActivity(account.type()))
                .switchIfEmpty(Mono.error(EntryValidator.bad(MovementService.WRONG_TYPE)));
    }

    /** The same pair rule the save applies, so the review never shows what the save would refuse. */
    private static Mono<Void> refuse(MovementKind kind, Account from, Account to) {
        String refusal = kind.refusal().apply(from, to);
        return refusal == null ? Mono.empty() : Mono.error(EntryValidator.bad(refusal));
    }

    private Mono<BigDecimal> balance(Account account) {
        return store.deltaOf(account.id()).map(delta -> account.openingAmount().add(delta.amount()));
    }

    private static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
