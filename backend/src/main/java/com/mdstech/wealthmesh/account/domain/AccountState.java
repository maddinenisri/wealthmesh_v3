package com.mdstech.wealthmesh.account.domain;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * What an account's status allows (slice 12). {@link AccountType#holdsActivity} answers "what type"; this answers
 * "what state". A writer calls one of these after it has locked the account row and read it again, so the answer
 * is the committed one (the UI hiding a choice is not the guard).
 */
public final class AccountState {

    public static final String ACTIVE = "active";
    public static final String ARCHIVED = "archived";
    public static final String CLOSED = "closed";

    private AccountState() {
    }

    /** New money (an entry, a leg of a transfer or payment, a move target, a correction, a reminder) needs an active account. */
    public static Account requireOpen(Account account) {
        if (!ACTIVE.equals(account.status())) {
            throw refused(account);
        }
        return account;
    }

    /** Changing or removing what an account already holds is allowed while it is archived, never once it is closed. */
    public static Account requireNotClosed(Account account) {
        if (CLOSED.equals(account.status())) {
            throw refused(account);
        }
        return account;
    }

    private static ResponseStatusException refused(Account account) {
        String how = switch (account.status()) {
            case ARCHIVED -> "archived. Restore it first.";
            case CLOSED -> "closed. Reopen it first.";
            default -> "not ready for money yet.";
        };
        return new ResponseStatusException(HttpStatus.CONFLICT, account.name() + " is " + how);
    }
}
