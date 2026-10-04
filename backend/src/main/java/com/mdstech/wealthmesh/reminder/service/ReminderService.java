package com.mdstech.wealthmesh.reminder.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.service.EntryValidator;
import com.mdstech.wealthmesh.reminder.domain.Reminder;
import com.mdstech.wealthmesh.reminder.dto.ReminderRequest;
import com.mdstech.wealthmesh.reminder.dto.ReminderResponse;
import com.mdstech.wealthmesh.reminder.repository.ReminderRepository;
import com.mdstech.wealthmesh.reminder.repository.ReminderStore;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Keeps a future-dated bill or expected income as a reminder. A replayed save key returns the stored one (D-024). */
@Service
public class ReminderService {

    private static final Duration KEY_LIFETIME = Duration.ofHours(24);

    /** The saved reminder and whether this call created it (false for a replay). */
    public record Saved(ReminderResponse reminder, boolean created) {
    }

    private final AccountRepository accounts;
    private final EntryValidator validator;
    private final ReminderRepository reminders;
    private final ReminderStore store;
    private final Clock clock;

    public ReminderService(AccountRepository accounts, EntryValidator validator, ReminderRepository reminders,
            ReminderStore store, Clock clock) {
        this.accounts = accounts;
        this.validator = validator;
        this.reminders = reminders;
        this.store = store;
        this.clock = clock;
    }

    public Flux<ReminderResponse> all() {
        return store.all();
    }

    public Mono<Saved> save(UUID accountId, String key, ReminderRequest request) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> accounts.findById(accountId)))
                .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Account not found: " + accountId)))
                .flatMap(account -> validator.parseReminder(account, request.kind(), request.asEntry()))
                .flatMap(entry -> store.expireKey(key, cutoff)
                        .then(reminders.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                                .flatMap(existing -> replay(existing, entry))
                                .switchIfEmpty(Mono.defer(() -> reminders.save(new Reminder(null, entry.accountId(),
                                        entry.kind(), entry.amount(), entry.occurredOn(), entry.description(),
                                        entry.categoryId(), entry.memberId(), key, now))
                                        .flatMap(saved -> store.byId(saved.id())).map(r -> new Saved(r, true))))))
                .onErrorMap(DuplicateKeyException.class, e -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "This save was already used. Start a new entry."));
    }

    private Mono<Saved> replay(Reminder existing, EntryValidator.Entry entry) {
        boolean same = existing.accountId().equals(entry.accountId()) && existing.kind().equals(entry.kind())
                && existing.amount().compareTo(entry.amount()) == 0 && existing.dueOn().equals(entry.occurredOn())
                && Objects.equals(existing.description(), entry.description())
                && Objects.equals(existing.categoryId(), entry.categoryId())
                && Objects.equals(existing.enteredByMemberId(), entry.memberId());
        if (!same) {
            return Mono.error(new ResponseStatusException(HttpStatus.CONFLICT,
                    "This save was already used with different details. Start a new entry."));
        }
        return store.byId(existing.id()).map(r -> new Saved(r, false));
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing save key");
        }
        return key;
    }
}
