package com.mdstech.wealthmesh.account.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.dto.AccountResponse;
import com.mdstech.wealthmesh.account.dto.AccountLifecycle;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.account.repository.AccountUsageStore;
import com.mdstech.wealthmesh.account.repository.AccountUsageStore.Usage;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Mono;

/**
 * Archive, restore, close, reopen and delete an account (A1 to A3). It follows the member lifecycle of slice 05: each
 * write takes the account row `FOR UPDATE`, reads the status again under it, and a repeat of the same action returns
 * the same result. None of it writes money. The review before each action lives in the UI.
 */
@Service
public class AccountLifecycleService {

    private final AccountRepository accounts;
    private final AccountService accountService;
    private final ActivityStore store;
    private final AccountUsageStore usage;
    private final TransactionalOperator transactions;
    private final Clock clock;

    public AccountLifecycleService(AccountRepository accounts, AccountService accountService, ActivityStore store,
            AccountUsageStore usage, TransactionalOperator transactions, Clock clock) {
        this.accounts = accounts;
        this.accountService = accountService;
        this.store = store;
        this.usage = usage;
        this.transactions = transactions;
        this.clock = clock;
    }

    /** Why an account could not be deleted right now, for the review (the delete checks again under the lock). */
    public Mono<AccountLifecycle> lifecycle(UUID id) {
        return load(id).flatMap(account -> usage.usageOf(id).map(found -> {
            List<String> reasons = blockers(account, found);
            return new AccountLifecycle(reasons.isEmpty(), reasons);
        }));
    }

    /**
     * Deletes an unused account: soft, so Undo brings it back. Blocked, with the reasons, by saved history (entries
     * of any kind, removed ones too, reminders, statements, starting-balance corrections) and by a non-zero opening
     * amount, which would take money out of wealth (Q-037, D-045).
     */
    public Mono<AccountResponse> delete(UUID id) {
        Mono<AccountResponse> work = store.lockAccount(id).then(Mono.defer(() -> load(id)))
                .flatMap(account -> usage.usageOf(id).flatMap(found -> {
                    List<String> reasons = blockers(account, found);
                    if (!reasons.isEmpty()) {
                        return Mono.<AccountResponse>error(conflict(account.name() + " has saved history that must be "
                                + "retained (" + String.join("; ", reasons) + "). Archive or close it instead."));
                    }
                    return accountService.findById(id).flatMap(response -> usage.setDeleted(id, clock.instant())
                            .thenReturn(response));
                }));
        return transactions.transactional(work);
    }

    /**
     * Brings a deleted account back. A repeat of the same Undo returns the same account and changes nothing (D-044);
     * so does an Undo of an account that was never deleted.
     */
    public Mono<AccountResponse> undoDelete(UUID id) {
        Mono<Void> work = store.lockAccount(id)
                .switchIfEmpty(Mono.error(
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)))
                .then(Mono.defer(() -> usage.setDeleted(id, null))).then();
        return transactions.transactional(work).then(Mono.defer(() -> accountService.findById(id)));
    }

    private static List<String> blockers(Account account, Usage found) {
        List<String> reasons = new ArrayList<>();
        if (found.entries() > 0) {
            reasons.add(found.entries() + (found.entries() == 1 ? " saved entry" : " saved entries")
                    + ", removed ones included");
        }
        if (found.reminders() > 0) {
            reasons.add(found.reminders() + (found.reminders() == 1 ? " reminder" : " reminders"));
        }
        if (found.statements() > 0) {
            reasons.add(found.statements() + (found.statements() == 1 ? " statement" : " statements"));
        }
        if (found.revisions() > 0) {
            reasons.add("a starting-balance correction");
        }
        if (account.openingAmount().signum() != 0) {
            reasons.add("a starting Balance of " + Money.format(account.openingAmount()));
        }
        return reasons;
    }

    /** Hides an account with money or debt from the active list; its Balance stays in wealth. */
    public Mono<AccountResponse> archive(UUID id) {
        return move(id, AccountState.ARCHIVED, AccountState.ACTIVE,
                account -> "Reopen " + account.name() + " before archiving it.");
    }

    /** Brings an archived account back to the active list with its Balance and history. */
    public Mono<AccountResponse> restore(UUID id) {
        return move(id, AccountState.ACTIVE, AccountState.ARCHIVED,
                account -> account.name() + " is closed. Reopen it instead.");
    }

    /**
     * Closes an account whose Balance is exactly zero (the money moved or the debt paid) and that has no entry dated
     * after today. A closed account takes no new money and no change until it is reopened.
     */
    public Mono<AccountResponse> close(UUID id) {
        return move(id, AccountState.CLOSED, AccountState.ACTIVE,
                account -> account.status().equals(AccountState.ARCHIVED)
                        ? "Restore " + account.name() + " before closing it."
                        : "Reopen " + account.name() + " before closing it.",
                this::requireZero);
    }

    /** Reopens a closed account explicitly; it returns to the active list with its history. */
    public Mono<AccountResponse> reopen(UUID id) {
        return move(id, AccountState.ACTIVE, AccountState.CLOSED,
                account -> account.name() + " is archived. Restore it instead.");
    }

    /** Closing needs an accounted-for zero Balance and nothing dated after today (read under the account lock). */
    private Mono<Void> requireZero(Account account) {
        return store.deltaOf(account.id()).flatMap(delta -> {
            BigDecimal balance = account.openingAmount().add(delta.amount());
            if (balance.signum() != 0) {
                return Mono.error(conflict("Closing " + account.name() + " needs a zero Balance. It has "
                        + Money.format(balance) + "; move it or pay it first."));
            }
            return store.countAfter(account.id(), LocalDate.now(clock)).flatMap(later -> later > 0
                    ? Mono.<Void>error(conflict(account.name() + " has " + later + " entr" + (later == 1 ? "y" : "ies")
                            + " dated after today. Remove or date " + (later == 1 ? "it" : "them")
                            + " first, then close."))
                    : Mono.<Void>empty());
        });
    }

    /**
     * Sets `target` when the account is in `from`; an account already in `target` is returned as it is (a repeat);
     * any other state is refused with `otherwise`.
     */
    private Mono<AccountResponse> move(UUID id, String target, String from,
            java.util.function.Function<Account, String> otherwise) {
        return move(id, target, from, otherwise, account -> Mono.empty());
    }

    private Mono<AccountResponse> move(UUID id, String target, String from,
            java.util.function.Function<Account, String> otherwise,
            java.util.function.Function<Account, Mono<Void>> precondition) {
        Mono<Account> work = store.lockAccount(id).then(Mono.defer(() -> load(id))).flatMap(account -> {
            if (target.equals(account.status())) {
                return Mono.just(account);
            }
            if (!from.equals(account.status())) {
                return Mono.error(conflict(otherwise.apply(account)));
            }
            return precondition.apply(account).then(Mono.defer(() -> accounts.save(new Account(account.id(),
                    account.householdId(), account.type(), account.name(), account.institution(),
                    account.openedOn(), account.openingAmount(), target, account.createdAt(), clock.instant()))));
        });
        return transactions.transactional(work).flatMap(saved -> accountService.findById(saved.id()));
    }

    private Mono<Account> load(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)));
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
