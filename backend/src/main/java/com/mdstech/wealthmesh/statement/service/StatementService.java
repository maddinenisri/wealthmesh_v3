package com.mdstech.wealthmesh.statement.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.service.EntryValidator;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.statement.domain.Statement;
import com.mdstech.wealthmesh.statement.dto.StatementRequest;
import com.mdstech.wealthmesh.statement.dto.StatementResponse;
import com.mdstech.wealthmesh.statement.repository.StatementRepository;
import com.mdstech.wealthmesh.statement.repository.StatementStore;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Attaches and revises optional supporting statements. A statement never changes Balance (V2_SUPPORTING_RECORD_003);
 * a revision is a new row linked to the version it replaces, and the database allows only one revision per version.
 */
@Service
public class StatementService {

    private static final Duration KEY_LIFETIME = Duration.ofHours(24);

    /** The saved statement and whether this call created it (false for a replay). */
    public record Saved(StatementResponse statement, boolean created) {
    }

    private record Parsed(LocalDate statementOn, BigDecimal balance, String note, String reason, UUID memberId) {
    }

    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final StatementRepository statements;
    private final StatementStore store;
    private final ActivityStore lock;
    private final Clock clock;
    private final TransactionalOperator transactions;

    public StatementService(AccountRepository accounts, EntryValidator validator, StatementRepository statements,
            StatementStore store, ActivityStore lock, Clock clock, TransactionalOperator transactions) {
        this.lock = lock;
        this.transactions = transactions;
        this.accounts = accounts;
        this.validator = validator;
        this.statements = statements;
        this.store = store;
        this.clock = clock;
    }

    public Flux<StatementResponse> ofAccount(UUID accountId) {
        return account(accountId).thenMany(Flux.defer(() -> store.ofAccount(accountId)));
    }

    public Mono<Saved> attach(UUID accountId, String key, StatementRequest request) {
        return save(accountId, null, key, request);
    }

    /** Only the latest version can be revised; the original stays, linked to its replacement. */
    public Mono<Saved> revise(UUID accountId, UUID statementId, String key, StatementRequest request) {
        return save(accountId, statementId, key, request);
    }

    private Mono<Saved> save(UUID accountId, UUID replacesId, String key, StatementRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> account(accountId)))
                .flatMap(account -> parse(account, request, replacesId != null)
                        // The account row is locked, so the same key sent twice at once replays instead of failing.
                        .flatMap(parsed -> transactions.transactional(lock.lockAccount(accountId)
                                .then(Mono.defer(() -> store.expireKey(key, cutoff)))
                                .then(Mono.defer(() -> statements.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                                        .flatMap(existing -> replay(existing, accountId, replacesId, parsed))
                                        .switchIfEmpty(Mono.defer(() -> insert(accountId, replacesId, key, parsed,
                                                now))))))))
                .onErrorMap(DuplicateKeyException.class, e -> conflict("This statement was already revised."));
    }

    private Mono<Saved> insert(UUID accountId, UUID replacesId, String key, Parsed parsed, Instant now) {
        Mono<Void> original = replacesId == null ? Mono.empty()
                : statements.findById(replacesId).filter(s -> accountId.equals(s.accountId()))
                        .switchIfEmpty(Mono.error(notFound("Statement not found: " + replacesId))).then();
        return original.then(Mono.defer(() -> statements.save(new Statement(null, accountId, parsed.statementOn(),
                        parsed.balance(), parsed.note(), parsed.reason(), replacesId, parsed.memberId(), key, now))))
                .flatMap(saved -> store.byId(saved.id())).map(s -> new Saved(s, true));
    }

    private Mono<Saved> replay(Statement existing, UUID accountId, UUID replacesId, Parsed parsed) {
        boolean same = existing.accountId().equals(accountId) && Objects.equals(existing.replacesId(), replacesId)
                && existing.statementOn().equals(parsed.statementOn())
                && existing.balance().compareTo(parsed.balance()) == 0
                && Objects.equals(existing.note(), parsed.note()) && Objects.equals(existing.reason(), parsed.reason())
                && existing.enteredByMemberId().equals(parsed.memberId());
        if (!same) {
            return Mono.error(conflict("This save was already used with different details. Start a new entry."));
        }
        return store.byId(existing.id()).map(s -> new Saved(s, false));
    }

    private Mono<Parsed> parse(Account account, StatementRequest request, boolean revision) {
        return Mono.fromCallable(() -> {
            if (request.statementOn() == null) {
                throw EntryValidator.bad("Enter the statement date");
            }
            if (request.statementOn().isAfter(LocalDate.now(clock))) {
                throw EntryValidator.bad("A statement cannot be dated in the future");
            }
            if (!(request.balance() instanceof String text) || Money.parse(text).isEmpty()) {
                throw EntryValidator.bad("Enter a valid amount");
            }
            String reason = text(request.reason(), 500, "Reason");
            if (revision && reason == null) {
                throw EntryValidator.bad("Enter a reason for the corrected statement");
            }
            return new Object[] { Money.parse(text).orElseThrow(), text(request.note(), 200, "Note"), reason };
        }).flatMap(parts -> validator.member(account, request.enteredByMemberId())
                .map(memberId -> new Parsed(request.statementOn(), (BigDecimal) parts[0], (String) parts[1],
                        (String) parts[2], memberId)));
    }

    private static String text(String value, int max, String label) {
        String text = value == null || value.isBlank() ? null : value.strip();
        if (text != null && text.length() > max) {
            throw EntryValidator.bad(label + " must be " + max + " characters or fewer");
        }
        return text;
    }

    private Mono<Account> account(UUID accountId) {
        return accounts.findById(accountId).switchIfEmpty(Mono.error(notFound("Account not found: " + accountId)));
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw EntryValidator.bad("Missing save key");
        }
        return key;
    }

    private static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
