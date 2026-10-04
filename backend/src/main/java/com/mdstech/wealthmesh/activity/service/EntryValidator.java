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
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.category.domain.Category;
import com.mdstech.wealthmesh.category.repository.CategoryRepository;
import com.mdstech.wealthmesh.household.repository.HouseholdMemberRepository;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Mono;

/** The rules for an entry of money in or out, shared by saving, replacing and reminders. */
@Component
public class EntryValidator {

    /** The validated parts of an entry request. */
    public record Entry(UUID accountId, String kind, BigDecimal amount, LocalDate occurredOn, String description,
            UUID categoryId, UUID memberId) {

        /** True when the stored row holds exactly these details (a repeated save). */
        boolean matches(Activity existing) {
            return existing.accountId().equals(accountId) && existing.kind().equals(kind)
                    && existing.amount().compareTo(amount) == 0 && existing.occurredOn().equals(occurredOn)
                    && Objects.equals(existing.description(), description)
                    && Objects.equals(existing.categoryId(), categoryId)
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
            BigDecimal amount = amount(request.amount());
            checkDate(account, request.occurredOn(), reminder);
            return new Object[] { amount, description(request.description()) };
        }).flatMap(parts -> category(kind, request)
                .flatMap(category -> member(account, request.enteredByMemberId())
                        .map(memberId -> new Entry(account.id(), kind, (BigDecimal) parts[0], request.occurredOn(),
                                (String) parts[1], category.id(), memberId))));
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

    private static String description(String text) {
        String description = text == null || text.isBlank() ? null : text.strip();
        if (description != null && description.length() > 200) {
            throw bad("Description must be 200 characters or fewer");
        }
        return description;
    }

    private Mono<Category> category(String kind, ExpenseRequest request) {
        String categoryKind = "income".equals(kind) ? "income" : "spending";
        Mono<Category> found = request.categoryId() != null ? categories.findById(request.categoryId())
                : request.category() != null && !request.category().isBlank()
                        ? categories.findByName(request.category().strip()) : Mono.empty();
        return found.filter(c -> categoryKind.equals(c.kind()))
                .switchIfEmpty(Mono.error(bad("Choose " + ("income".equals(categoryKind) ? "an income" : "a spending")
                        + " category")));
    }

    Mono<UUID> member(Account account, UUID memberId) {
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

    static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
