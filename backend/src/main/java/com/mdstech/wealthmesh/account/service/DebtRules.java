package com.mdstech.wealthmesh.account.service;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;

import reactor.core.publisher.Mono;

/**
 * The rule every writer of a loan shares: a debt never becomes an asset (D-053, LOAN_006). A payment, a correction, a
 * removal, an Undo or a new initial amount may not leave the Balance above zero. Called inside the writing
 * transaction after the change, with the account row locked, so the figure read is the one that would be committed
 * and a refusal rolls the change back.
 */
@Component
public class DebtRules {

    private final AccountRepository accounts;
    private final ActivityStore store;

    public DebtRules(AccountRepository accounts, ActivityStore store) {
        this.accounts = accounts;
        this.store = store;
    }

    /** Refuses (409) when the loan would hold a credit on any date; any other account passes. */
    public Mono<Void> requireNotCredit(UUID accountId) {
        return accounts.findById(accountId).filter(account -> AccountType.isDebt(account.type()))
                .flatMap(account -> requireNotCreditWith(account, account.openingAmount()));
    }

    /**
     * The same rule for an initial amount that is not saved yet (the review): the Balance on every date, not only
     * today's, so a payment dated before a later correction cannot leave the loan as a credit on the days between.
     */
    public Mono<Void> requireNotCreditWith(Account account, BigDecimal opening) {
        return store.dailyChanges(account.id()).collectList().flatMap(days -> {
            BigDecimal balance = opening;
            for (ActivityStore.Delta day : days) {
                balance = balance.add(day.amount());
                if (balance.signum() > 0) {
                    return Mono.<Void>error(credit(account.name(), balance, day.latest()));
                }
            }
            return Mono.<Void>empty();
        });
    }

    /** The refusal: the loan would hold a credit (on `on`, when known). */
    public static ResponseStatusException credit(String name, BigDecimal balance, java.time.LocalDate on) {
        return new ResponseStatusException(HttpStatus.CONFLICT, "This would leave " + name + " with a credit of "
                + dollars(balance) + (on == null ? "" : " on " + on) + ": the payments and corrections saved would "
                + "add up to more than the debt. Correct or remove one of them first.");
    }

    private static String dollars(BigDecimal amount) {
        return String.format(Locale.US, "$%,.2f", amount);
    }
}
