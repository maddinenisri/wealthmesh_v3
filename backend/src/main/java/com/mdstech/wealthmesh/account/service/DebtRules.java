package com.mdstech.wealthmesh.account.service;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

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

    /** Refuses (409) when the loan would hold a credit; any other account passes. */
    public Mono<Void> requireNotCredit(UUID accountId) {
        return accounts.findById(accountId).filter(account -> AccountType.isDebt(account.type()))
                .flatMap(account -> store.deltaOf(account.id()).flatMap(delta -> {
                    BigDecimal balance = account.openingAmount().add(delta.amount());
                    return balance.signum() > 0
                            ? Mono.<Void>error(new ResponseStatusException(HttpStatus.CONFLICT, "This would leave "
                                    + account.name() + " with a credit of " + dollars(balance) + ": the payments and "
                                    + "corrections saved would add up to more than the debt. Correct or remove one "
                                    + "of them first."))
                            : Mono.<Void>empty();
                }));
    }

    private static String dollars(BigDecimal amount) {
        return String.format(Locale.US, "$%,.2f", amount);
    }
}
