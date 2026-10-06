package com.mdstech.wealthmesh.activity.service;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.repository.AccountRepository;

import reactor.core.publisher.Mono;

/** Decides which account a replacement lands on. The server enforces it; the account chooser only hides options. */
@Component
class MoveTarget {

    private final AccountRepository accounts;

    MoveTarget(AccountRepository accounts) {
        this.accounts = accounts;
    }

    /**
     * The account the entry is on, or the requested one when it is in the same household and holds activity.
     * An account of another household is reported as not found.
     */
    Mono<Account> resolve(UUID sourceId, UUID requested) {
        UUID targetId = requested == null ? sourceId : requested;
        return accounts.findById(targetId).switchIfEmpty(Mono.error(notFound(targetId)))
                .flatMap(target -> accounts.findById(sourceId).flatMap(source -> {
                    if (!source.householdId().equals(target.householdId())) {
                        return Mono.error(notFound(targetId));
                    }
                    // Moving to another account is new money there: it must be active (the save checks again).
                    if (!target.id().equals(source.id())) {
                        AccountState.requireOpen(target);
                    }
                    return AccountType.holdsActivity(target.type()) ? Mono.just(target)
                            : Mono.error(EntryValidator.bad("Money cannot be moved to this type of account yet"));
                }));
    }

    private static ResponseStatusException notFound(UUID id) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id);
    }
}
