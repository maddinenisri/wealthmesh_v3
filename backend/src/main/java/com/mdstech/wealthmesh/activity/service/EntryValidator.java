package com.mdstech.wealthmesh.activity.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.category.domain.Category;
import com.mdstech.wealthmesh.category.repository.CategoryRepository;
import com.mdstech.wealthmesh.category.service.CategoryService;
import com.mdstech.wealthmesh.household.repository.HouseholdMemberRepository;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Mono;

/** The rules for an entry of money in or out, shared by saving, replacing and reminders. */
@Component
public class EntryValidator {

    /** The validated parts of an entry request. */
    public record Entry(UUID accountId, String kind, BigDecimal amount, LocalDate occurredOn, String description,
            UUID categoryId, UUID memberId, String classification) {

        /** True when the stored row holds exactly these details (a repeated save). */
        boolean matches(Activity existing) {
            return existing.accountId().equals(accountId) && existing.kind().equals(kind)
                    && existing.amount().compareTo(amount) == 0 && existing.occurredOn().equals(occurredOn)
                    && Objects.equals(existing.description(), description)
                    && Objects.equals(existing.categoryId(), categoryId)
                    && Objects.equals(existing.classification(), classification)
                    && Objects.equals(existing.enteredByMemberId(), memberId);
        }
    }

    private final CategoryRepository categories;
    private final HouseholdMemberRepository members;
    private final Clock clock;

    public EntryValidator(CategoryRepository categories, HouseholdMemberRepository members, Clock clock) {
        this.categories = categories;
        this.members = members;
        this.clock = clock;
    }

    Mono<Entry> parse(Account account, String kind, ExpenseRequest request) {
        return parse(account, kind, request, false);
    }

    /** A reminder is dated after today and is saved as a plan; its kind must be expense or income. */
    public Mono<Entry> parseReminder(Account account, String kind, ExpenseRequest request) {
        if (!"expense".equals(kind) && !"income".equals(kind)) {
            return Mono.error(bad("Choose expense or income"));
        }
        return parse(account, kind, request, true);
    }

    private Mono<Entry> parse(Account account, String kind, ExpenseRequest request, boolean reminder) {
        return Mono.fromCallable(() -> {
            if ("income".equals(kind) && AccountType.isCard(account.type())) {
                throw bad("A card records purchases, refunds and payments, not income");
            }
            BigDecimal amount = amount(request.amount());
            checkDate(account, request.occurredOn(), reminder);
            return new Object[] { amount, description(request.description()) };
        }).flatMap(parts -> category(kind, request, reminder)
                .flatMap(category -> member(account, request.enteredByMemberId())
                        .map(memberId -> new Entry(account.id(), kind, (BigDecimal) parts[0], request.occurredOn(),
                                (String) parts[1], category.map(Category::id).orElse(null), memberId,
                                classification(kind, request, category.orElse(null))))));
    }

    private void checkDate(Account account, LocalDate date, boolean reminder) {
        LocalDate today = LocalDate.now(clock);
        if (date == null) {
            throw bad("Enter a date");
        }
        if (reminder && !date.isAfter(today)) {
            throw bad("A reminder needs a date after today");
        }
        if (!reminder && date.isAfter(today)) {
            throw bad("Future activity is not saved as completed history yet");
        }
        if (date.isBefore(account.openedOn())) {
            throw bad("This date is before the account's opening date");
        }
    }

    static String description(String text) {
        String description = text == null || text.isBlank() ? null : text.strip();
        if (description != null && description.length() > 200) {
            throw bad("Description must be 200 characters or fewer");
        }
        return description;
    }

    /**
     * The category an entry names. An expense may have none (CATEGORIES_006: it is saved as Uncategorized and flagged
     * for review); income, refunds and reminders must name one of their own kind.
     */
    private Mono<java.util.Optional<Category>> category(String kind, ExpenseRequest request, boolean reminder) {
        String categoryKind = "income".equals(kind) ? "income" : "spending";
        boolean named = request.categoryId() != null || request.category() != null && !request.category().isBlank();
        if (!named && "expense".equals(kind) && !reminder) {
            return Mono.just(java.util.Optional.empty());
        }
        Mono<Category> found = request.categoryId() != null ? categories.findById(request.categoryId())
                : named ? categories.findByName(request.category().strip()) : Mono.empty();
        return found.filter(c -> categoryKind.equals(c.kind())).map(java.util.Optional::of)
                .switchIfEmpty(Mono.error(bad("Choose " + ("income".equals(categoryKind) ? "an income" : "a spending")
                        + " category")));
    }

    /**
     * The class an expense or refund is saved with: the one chosen, else the category's default at this moment. It is
     * stored on the entry, so changing a default later never rewrites it (CATEGORIES_002). Income has none.
     */
    private static String classification(String kind, ExpenseRequest request, Category category) {
        String chosen = request.classification() == null || request.classification().isBlank() ? null
                : request.classification();
        if ("income".equals(kind)) {
            if (chosen != null) {
                throw bad("An income entry has no Essential or Discretionary choice");
            }
            return null;
        }
        if (chosen != null && !CategoryService.CLASSES.contains(chosen)) {
            throw bad("Choose Essential or Discretionary");
        }
        return chosen != null ? chosen : category == null ? null : category.defaultClass();
    }

    public Mono<UUID> member(Account account, UUID memberId) {
        if (memberId == null) {
            return Mono.error(bad("Choose who entered this"));
        }
        return members.findById(memberId).filter(m -> m.householdId().equals(account.householdId()))
                .switchIfEmpty(Mono.error(bad("Choose who entered this from this household")))
                .flatMap(m -> m.active() ? Mono.just(m.id()) : Mono.error(bad("Choose an active member")));
    }

    /** The same rule as {@link #member}, read under a share lock so a deactivate cannot slip in before the save. */
    public Mono<UUID> memberLocked(Account account, UUID memberId) {
        if (memberId == null) {
            return Mono.error(bad("Choose who entered this"));
        }
        return members.findByIdForShare(memberId).filter(m -> m.householdId().equals(account.householdId()))
                .switchIfEmpty(Mono.error(bad("Choose who entered this from this household")))
                .flatMap(m -> m.active() ? Mono.just(m.id()) : Mono.error(bad("Choose an active member")));
    }

    public static BigDecimal amount(Object value) {
        if (!(value instanceof String text) || Money.parse(text).isEmpty()) {
            throw bad("Enter a valid amount");
        }
        BigDecimal amount = Money.parse(text).orElseThrow();
        if (amount.signum() <= 0) {
            throw bad("Enter an amount greater than zero");
        }
        return amount;
    }

    public static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
