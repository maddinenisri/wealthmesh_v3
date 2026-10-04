package com.mdstech.wealthmesh.activity.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.dto.ActivityResponse;
import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.category.domain.Category;
import com.mdstech.wealthmesh.category.repository.CategoryRepository;
import com.mdstech.wealthmesh.household.repository.HouseholdMemberRepository;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Records expenses on a checking account. A replayed save key returns the stored expense (D-024). */
@Service
public class ExpenseService {

    /** How long a save key is remembered. */
    static final Duration KEY_LIFETIME = Duration.ofHours(24);

    /** The saved expense and whether this call created it (false for a replay). */
    public record Saved(ActivityResponse activity, boolean created) {
    }

    private final AccountRepository accounts;
    private final CategoryRepository categories;
    private final HouseholdMemberRepository members;
    private final ActivityRepository activities;
    private final ActivityStore store;
    private final Clock clock;

    public ExpenseService(AccountRepository accounts, CategoryRepository categories,
            HouseholdMemberRepository members, ActivityRepository activities, ActivityStore store, Clock clock) {
        this.accounts = accounts;
        this.categories = categories;
        this.members = members;
        this.activities = activities;
        this.store = store;
        this.clock = clock;
    }

    public Flux<ActivityResponse> activityOf(UUID accountId) {
        return load(accountId).thenMany(Flux.defer(() -> store.forAccount(accountId)));
    }

    public Mono<Saved> record(UUID accountId, String key, ExpenseRequest request) {
        return Mono.fromCallable(() -> requireKey(key))
                .then(Mono.defer(() -> load(accountId)))
                .flatMap(account -> parse(account, request).flatMap(entry -> save(entry, key)));
    }

    /** The validated parts of an expense request. */
    record Entry(UUID accountId, BigDecimal amount, LocalDate occurredOn, String description, UUID categoryId,
            UUID memberId) {
    }

    private Mono<Saved> save(Entry entry, String key) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(KEY_LIFETIME);
        Mono<Saved> insert = activities.save(new Activity(null, entry.accountId(), "expense", entry.amount(),
                        entry.occurredOn(), entry.description(), entry.categoryId(), entry.memberId(), key, now))
                .flatMap(saved -> store.byId(saved.id())).map(a -> new Saved(a, true));
        return store.expireKey(key, cutoff)
                .then(activities.findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                        .flatMap(existing -> replay(existing, entry))
                        .switchIfEmpty(Mono.defer(() -> insert)))
                // Two identical requests racing: the loser hits the unique key and replays the winner's row.
                .onErrorResume(DuplicateKeyException.class, e -> activities
                        .findByIdempotencyKeyAndCreatedAtAfter(key, cutoff)
                        .flatMap(existing -> replay(existing, entry)));
    }

    private Mono<Saved> replay(Activity existing, Entry entry) {
        boolean same = existing.accountId().equals(entry.accountId())
                && existing.amount().compareTo(entry.amount()) == 0
                && existing.occurredOn().equals(entry.occurredOn())
                && java.util.Objects.equals(existing.description(), entry.description())
                && java.util.Objects.equals(existing.categoryId(), entry.categoryId())
                && java.util.Objects.equals(existing.enteredByMemberId(), entry.memberId());
        if (!same) {
            return Mono.error(new ResponseStatusException(HttpStatus.CONFLICT,
                    "This save was already used with different details. Start a new entry."));
        }
        return store.byId(existing.id()).map(a -> new Saved(a, false));
    }

    private Mono<Entry> parse(Account account, ExpenseRequest request) {
        return Mono.fromCallable(() -> {
            BigDecimal amount = amount(request.amount());
            LocalDate today = LocalDate.now(clock);
            if (request.occurredOn() == null) {
                throw bad("Enter a date");
            }
            if (request.occurredOn().isAfter(today)) {
                throw bad("Future activity is not saved as completed history yet");
            }
            if (request.occurredOn().isBefore(account.openedOn())) {
                throw bad("This date is before the account's opening date");
            }
            String description = request.description() == null || request.description().isBlank() ? null
                    : request.description().strip();
            if (description != null && description.length() > 200) {
                throw bad("Description must be 200 characters or fewer");
            }
            return new Object[] { amount, description };
        }).flatMap(parts -> category(request)
                .flatMap(category -> member(account, request.enteredByMemberId())
                        .map(memberId -> new Entry(account.id(), (BigDecimal) parts[0], request.occurredOn(),
                                (String) parts[1], category.id(), memberId))));
    }

    private Mono<Category> category(ExpenseRequest request) {
        Mono<Category> found = request.categoryId() != null ? categories.findById(request.categoryId())
                : request.category() != null && !request.category().isBlank()
                        ? categories.findByName(request.category().strip()) : Mono.empty();
        return found.filter(c -> "spending".equals(c.kind()))
                .switchIfEmpty(Mono.error(bad("Choose a spending category")));
    }

    private Mono<UUID> member(Account account, UUID memberId) {
        if (memberId == null) {
            return Mono.error(bad("Choose who entered this"));
        }
        return members.findById(memberId).filter(m -> m.householdId().equals(account.householdId()))
                .map(m -> m.id()).switchIfEmpty(Mono.error(bad("Choose who entered this from this household")));
    }

    static BigDecimal amount(Object value) {
        if (!(value instanceof String text) || Money.parse(text).isEmpty()) {
            throw bad("Enter a valid amount");
        }
        BigDecimal amount = Money.parse(text).orElseThrow();
        if (amount.signum() <= 0) {
            throw bad("Enter an amount greater than zero");
        }
        return amount;
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw bad("Missing save key");
        }
        return key;
    }

    private Mono<Account> load(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)))
                .flatMap(account -> "checking".equals(account.type()) ? Mono.just(account)
                        : Mono.error(bad("Expenses can only be recorded on a checking account for now")));
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
