package com.mdstech.wealthmesh.account.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.dto.AccountEvent;
import com.mdstech.wealthmesh.account.dto.AccountLifecycle;
import com.mdstech.wealthmesh.account.dto.AccountResponse;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.account.repository.AccountUsageStore;
import com.mdstech.wealthmesh.account.repository.AccountUsageStore.Usage;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.service.EntryValidator;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Archive, restore, close, reopen and delete an account (A1 to A3). It follows the member lifecycle of slice 05: each
 * write takes the account row `FOR UPDATE`, reads the status again under it, and a repeat of the same action returns
 * the same result. None of it writes money. A change that happens records who made it and when (`account_event`), in
 * the same transaction; the person is a required body field, checked under a share lock.
 * The review before each action lives in the UI.
 */
@Service
public class AccountLifecycleService {

    private final AccountRepository accounts;
    private final AccountService accountService;
    private final ActivityStore store;
    private final AccountUsageStore usage;
    private final EntryValidator validator;
    private final TransactionalOperator transactions;
    private final Clock clock;

    public AccountLifecycleService(AccountRepository accounts, AccountService accountService, ActivityStore store,
            AccountUsageStore usage, EntryValidator validator, TransactionalOperator transactions, Clock clock) {
        this.accounts = accounts;
        this.accountService = accountService;
        this.store = store;
        this.usage = usage;
        this.validator = validator;
        this.transactions = transactions;
        this.clock = clock;
    }

    /** Why an account could not be deleted right now, for the review (the delete checks again under the lock). */
    public Mono<AccountLifecycle> lifecycle(UUID id) {
        return load(id).flatMap(account -> usage.usageOf(id).map(found -> {
            List<String> reasons = blockers(account, found);
            return usage.plannedValues(id).map(planned -> new AccountLifecycle(reasons.isEmpty(), reasons,
                    planned > 0 ? List.of(plannedMessage(account, planned)) : List.of()));
        }).flatMap(result -> result));
    }

    /** The account's changes of state, newest first. */
    public Flux<AccountEvent> events(UUID id) {
        return load(id).thenMany(Flux.defer(() -> usage.eventsOf(id)));
    }

    /**
     * Deletes an unused account: soft, so Undo brings it back. Blocked, with the reasons, by saved history (entries
     * of any kind, removed ones too, reminders, statements, starting-balance corrections) and by a non-zero opening
     * amount, which would take money out of wealth (Q-037, D-045).
     */
    public Mono<AccountResponse> delete(UUID id, UUID memberId) {
        Mono<AccountResponse> work = store.lockAccount(id).then(Mono.defer(() -> load(id)))
                .flatMap(account -> usage.usageOf(id).flatMap(found -> {
                    List<String> reasons = blockers(account, found);
                    if (!reasons.isEmpty()) {
                        return Mono.<AccountResponse>error(conflict(account.name() + " has saved history that must be "
                                + "retained (" + String.join("; ", reasons) + "). Archive or close it instead."));
                    }
                    return accountService.findById(id)
                            .flatMap(response -> actor(account, memberId)
                                    .then(Mono.defer(() -> usage.setDeleted(id, clock.instant())))
                                    .then(Mono.defer(() -> record(id, "deleted", memberId)))
                                    .thenReturn(response));
                }));
        return transactions.transactional(work);
    }

    /**
     * Brings a deleted account back. A repeat of the same Undo returns the same account and changes nothing (D-044);
     * so does an Undo of an account that was never deleted.
     */
    public Mono<AccountResponse> undoDelete(UUID id, UUID memberId) {
        Mono<Void> work = store.lockAccount(id)
                .switchIfEmpty(Mono.error(
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)))
                .then(Mono.defer(() -> usage.wasDiscarded(id)))
                .flatMap(discarded -> discarded
                        ? Mono.<Long>error(conflict("A discarded draft cannot be brought back."))
                        : usage.setDeleted(id, null))
                .flatMap(changed -> changed == 0 ? Mono.<Void>empty()
                        : load(id).flatMap(account -> actor(account, memberId))
                                .then(Mono.defer(() -> record(id, "undeleted", memberId))));
        return transactions.transactional(work).then(Mono.defer(() -> accountService.findById(id)));
    }

    /** Hides an account with money or debt from the active list; its Balance stays in wealth. */
    public Mono<AccountResponse> archive(UUID id, UUID memberId) {
        return move(id, memberId, AccountState.ARCHIVED, AccountState.ACTIVE, "archived",
                account -> "Reopen " + account.name() + " before archiving it.", account -> Mono.empty());
    }

    /** Brings an archived account back to the active list with its Balance and history. */
    public Mono<AccountResponse> restore(UUID id, UUID memberId) {
        return move(id, memberId, AccountState.ACTIVE, AccountState.ARCHIVED, "restored",
                account -> account.name() + " is closed. Reopen it instead.", account -> Mono.empty());
    }

    /**
     * Closes an account whose Balance is exactly zero (the money moved or the debt paid) and that has no entry dated
     * after today. A closed account takes no new money and no change until it is reopened.
     */
    public Mono<AccountResponse> close(UUID id, UUID memberId) {
        return move(id, memberId, AccountState.CLOSED, AccountState.ACTIVE, "closed",
                account -> account.status().equals(AccountState.ARCHIVED)
                        ? "Restore " + account.name() + " before closing it."
                        : "Reopen " + account.name() + " before closing it.",
                this::requireZero);
    }

    /** Reopens a closed account explicitly; it returns to the active list with its history. */
    public Mono<AccountResponse> reopen(UUID id, UUID memberId) {
        return move(id, memberId, AccountState.ACTIVE, AccountState.CLOSED, "reopened",
                account -> account.name() + " is archived. Restore it instead.", account -> Mono.empty());
    }

    /** Closing needs an accounted-for zero Balance and nothing dated after today (read under the account lock). */
    private Mono<Void> requireZero(Account account) {
        return store.deltaOf(account.id()).flatMap(delta -> {
            BigDecimal balance = account.openingAmount().add(delta.amount());
            if (balance.signum() != 0) {
                if (AccountType.isDebt(account.type())) {
                    return Mono.error(conflict("Closing " + account.name() + " needs a zero Balance owed. It has "
                            + dollars(balance.abs()) + " owed; record a payment first."));
                }
                return Mono.error(conflict("Closing " + account.name() + " needs a zero Balance. It has "
                        + dollars(balance) + closeAdvice(account)));
            }
            Mono<Void> noPlan = usage.plannedValues(account.id()).flatMap(planned -> planned > 0
                    ? Mono.<Void>error(conflict(plannedMessage(account, planned))) : Mono.<Void>empty());
            if (AccountType.isValued(account.type())) {
                return noPlan;
            }
            // A debt also keeps its plans (DATED_VALUE_001): the same rule and message as a property's.
            Mono<Void> later = store.countAfter(account.id(), LocalDate.now(clock)).flatMap(count -> count > 0
                    ? Mono.<Void>error(conflict(account.name() + " has " + count + " entr"
                            + (count == 1 ? "y" : "ies") + " dated after today. Remove or date "
                            + (count == 1 ? "it" : "them") + " first, then close."))
                    : Mono.<Void>empty());
            return AccountType.isDebt(account.type()) ? noPlan.then(later) : later;
        });
    }

    /**
     * Sets `target` when the account is in `from` and records who and when; an account already in `target` is returned
     * as it is (a repeat, no event); any other state is refused with `otherwise`.
     */
    private Mono<AccountResponse> move(UUID id, UUID memberId, String target, String from, String action,
            Function<Account, String> otherwise, Function<Account, Mono<Void>> precondition) {
        Mono<Account> work = store.lockAccount(id).then(Mono.defer(() -> load(id))).flatMap(account -> {
            if (target.equals(account.status())) {
                return Mono.just(account);
            }
            if (AccountState.DRAFT.equals(account.status())) {
                return Mono.error(conflict("Finish setting up " + account.name() + " or discard it first."));
            }
            if (!from.equals(account.status())) {
                return Mono.error(conflict(otherwise.apply(account)));
            }
            return actor(account, memberId).then(Mono.defer(() -> precondition.apply(account)))
                    .then(Mono.defer(() -> accounts.save(new Account(account.id(), account.householdId(),
                            account.type(), account.name(), account.institution(), account.openedOn(),
                            account.openingAmount(), target, account.createdAt(), clock.instant()))))
                    .flatMap(saved -> record(saved.id(), action, memberId).thenReturn(saved));
        });
        return transactions.transactional(work).flatMap(saved -> accountService.findById(saved.id()));
    }

    /** The person is checked under a share lock (D-034), so a deactivate cannot slip in. */
    private Mono<Void> actor(Account account, UUID memberId) {
        return validator.memberLocked(account, memberId).then();
    }

    private Mono<Void> record(UUID id, String action, UUID memberId) {
        return usage.recordEvent(id, action, memberId, clock.instant());
    }

    private Mono<Account> load(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)));
    }

    private static List<String> blockers(Account account, Usage found) {
        List<String> reasons = new ArrayList<>();
        if (found.entries() > 0) {
            reasons.add(counted(found.entries(), "saved entry", "saved entries") + " (removed ones count)");
        }
        if (found.reminders() > 0) {
            reasons.add(counted(found.reminders(), "reminder", "reminders"));
        }
        if (found.statements() > 0) {
            reasons.add(counted(found.statements(), "statement", "statements") + " (removed ones count)");
        }
        if (found.prices() > 0) {
            reasons.add(counted(found.prices(), "recorded price", "recorded prices") + " (replaced ones count)");
        }
        if (found.schedules() > 0) {
            reasons.add(counted(found.schedules(), "recurring bill", "recurring bills"));
        }
        if (found.values() > 0) {
            reasons.add(valuesCounted(account, found.values()));
        }
        if (found.revisions() > 0) {
            reasons.add(AccountType.isValued(account.type()) ? "a start moved earlier"
                    : "a starting-balance correction");
        }
        if (account.openingAmount().signum() != 0) {
            reasons.add(AccountType.isDebt(account.type())
                    ? "a starting amount owed of " + dollars(account.openingAmount().abs())
                    : "a starting Balance of " + dollars(account.openingAmount()));
        }
        return reasons;
    }

    private static String valuesCounted(Account account, long values) {
        return (AccountType.isDebt(account.type())
                ? counted(values, "planned amount", "planned amounts")
                : counted(values, "dated value", "dated values")) + " (removed ones count)";
    }

    private static String plannedMessage(Account account, long planned) {
        String noun = AccountType.isDebt(account.type()) ? "planned amount" : "planned value";
        return account.name() + " has " + planned + " " + noun + (planned == 1 ? "" : "s") + ". Remove "
                + (planned == 1 ? "it" : "them") + " first, then close.";
    }

    private static String counted(long count, String one, String many) {
        return count + " " + (count == 1 ? one : many);
    }

    /** "$1,000.00" or "-$30.00": the way a person reads an amount in a sentence. */
    private static String closeAdvice(Account account) {
        if (AccountType.DEFINED_BENEFIT.wire().equals(account.type())) {
            return "; record a $0.00 plan value first (for example when the plan ends).";
        }
        if (AccountType.isValued(account.type())) {
            return "; record a $0.00 value first (for example when it is sold).";
        }
        return AccountType.isInvestment(account.type())
                ? ". Moving money out of an investment account comes in a later release."
                : "; move it or pay it first.";
    }

    static String dollars(BigDecimal amount) {
        return (amount.signum() < 0 ? "-" : "") + String.format(Locale.US, "$%,.2f", amount.abs());
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
