package com.mdstech.wealthmesh.activity.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.activity.domain.Activity;
import com.mdstech.wealthmesh.activity.domain.Portion;
import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.activity.dto.PortionRequest;
import com.mdstech.wealthmesh.category.domain.Category;
import com.mdstech.wealthmesh.category.repository.CategoryRepository;
import com.mdstech.wealthmesh.category.repository.CategoryStore;
import com.mdstech.wealthmesh.category.service.CategoryService;
import com.mdstech.wealthmesh.household.repository.HouseholdMemberRepository;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** The rules for an entry of money in or out, shared by saving, replacing and reminders. */
@Component
public class EntryValidator {

    /** Most portions one payment can have. */
    static final int MAX_PORTIONS = 20;

    /** The validated parts of an entry request. `portions` is empty unless the expense is split (no own category). */
    public record Entry(UUID accountId, String kind, BigDecimal amount, LocalDate occurredOn, String description,
            UUID categoryId, UUID memberId, String classification, List<Portion> portions) {

        /** True when the stored row and its stored portions hold exactly these details (a repeated save). */
        boolean matches(Activity existing, List<Portion> storedPortions) {
            return portionsMatch(storedPortions) && existing.accountId().equals(accountId)
                    && existing.kind().equals(kind)
                    && existing.amount().compareTo(amount) == 0 && existing.occurredOn().equals(occurredOn)
                    && Objects.equals(existing.description(), description)
                    && Objects.equals(existing.categoryId(), categoryId)
                    && Objects.equals(existing.classification(), classification)
                    && Objects.equals(existing.enteredByMemberId(), memberId);
        }

        private boolean portionsMatch(List<Portion> stored) {
            if (stored.size() != portions.size()) {
                return false;
            }
            for (int i = 0; i < stored.size(); i++) {
                if (!stored.get(i).sameAs(portions.get(i))) {
                    return false;
                }
            }
            return true;
        }
    }

    private final CategoryRepository categories;
    private final CategoryStore categoryStore;
    private final HouseholdMemberRepository members;
    private final Clock clock;

    public EntryValidator(CategoryRepository categories, CategoryStore categoryStore,
            HouseholdMemberRepository members, Clock clock) {
        this.categoryStore = categoryStore;
        this.categories = categories;
        this.members = members;
        this.clock = clock;
    }

    Mono<Entry> parse(Account account, String kind, ExpenseRequest request) {
        return parse(account, kind, request, false, Set.of(), false);
    }

    /**
     * An expense that may be split across spending categories (SPLITS_001): the one entry point that accepts
     * `portions`. `keptCategories` are the categories the entry already has (the payment's or its portions'), which a
     * correction may keep even if archived since.
     */
    public Mono<Entry> parseSplittable(Account account, String kind, ExpenseRequest request,
            Set<UUID> keptCategories) {
        return parse(account, kind, request, false, keptCategories, true);
    }

    /**
     * An edit may keep the category the entry already has even if it was archived since (CATEGORIES_005: old
     * entries keep their label); any other category must be active.
     */
    public Mono<Entry> parse(Account account, String kind, ExpenseRequest request, UUID keptCategoryId) {
        return parse(account, kind, request, false, keptCategoryId == null ? Set.of() : Set.of(keptCategoryId), false);
    }

    /** What a retry is compared with: the category, class and portions of the row saved under its key. */
    public record Stored(UUID categoryId, String classification, List<Portion> portions) {

        private static final UUID NONE = new UUID(0, 0);

        UUID categoryOrNone() {
            return categoryId == null ? NONE : categoryId;
        }
    }

    /**
     * The one replay mechanism (D-024, Q-044): the same request again, judged on what was saved. It checks only what
     * the request itself must be (an amount, a date, a member, a split's shape) and resolves the category and member to
     * ids without today's rules: an archived or merged category and a deactivated member still resolve, a date that is
     * past or before the account's start is not refused, and an omitted class is the stored one. The caller compares
     * the result with the stored row. Never use it to save: a new key goes through {@link #parse}.
     */
    public Mono<Entry> parseForReplay(Account account, String kind, ExpenseRequest request, Stored stored) {
        return parseForReplay(account, kind, request, stored, false);
    }

    /** The same for a reminder: its kind must be expense or income, it names a category and cannot be split. */
    public Mono<Entry> parseReminderForReplay(Account account, String kind, ExpenseRequest request, Stored stored) {
        if (!"expense".equals(kind) && !"income".equals(kind)) {
            return Mono.error(bad("Choose expense or income"));
        }
        return parseForReplay(account, kind, request, stored, true);
    }

    private Mono<Entry> parseForReplay(Account account, String kind, ExpenseRequest request, Stored stored,
            boolean reminder) {
        boolean split = request.portions() != null && !request.portions().isEmpty();
        if (split && reminder) {
            return Mono.error(bad("This entry cannot be split across categories"));
        }
        return Mono.fromCallable(() -> replayParts(account, kind, request, split)).flatMap(parts -> split
                ? replayPortions(request.portions(), stored)
                        .map(list -> new Entry(account.id(), kind, (BigDecimal) parts[0], request.occurredOn(),
                                (String) parts[1], null, request.enteredByMemberId(), null, list))
                : replayCategory(kind, request, reminder, stored)
                        .map(category -> new Entry(account.id(), kind, (BigDecimal) parts[0], request.occurredOn(),
                                (String) parts[1], category.orElse(null), request.enteredByMemberId(),
                                replayClass(kind, request.classification(), stored.classification()), List.of())));
    }

    /** What a request must be whatever the ledger says now: an amount, a date, a member, a split's shape. */
    private static Object[] replayParts(Account account, String kind, ExpenseRequest request, boolean split) {
        if ("income".equals(kind) && AccountType.isCard(account.type())) {
            throw bad("A card records purchases, refunds and payments, not income");
        }
        if (request.occurredOn() == null) {
            throw bad("Enter a date");
        }
        if (request.enteredByMemberId() == null) {
            throw bad("Choose who entered this");
        }
        if (split) {
            checkSplitShape(kind, request);
        }
        return new Object[] { amount(request.amount()), description(request.description()) };
    }

    private Mono<java.util.Optional<UUID>> replayCategory(String kind, ExpenseRequest request, boolean reminder,
            Stored stored) {
        boolean named = request.categoryId() != null || request.category() != null && !request.category().isBlank();
        if (!named && "expense".equals(kind) && !reminder) {
            return Mono.just(java.util.Optional.empty());
        }
        if (request.categoryId() != null) {
            return Mono.just(java.util.Optional.of(request.categoryId()));
        }
        String categoryKind = "income".equals(kind) ? "income" : "spending";
        return (named ? categories.findAnyByKindAndName(categoryKind, request.category().strip(),
                stored.categoryOrNone()) : Mono.<Category>empty())
                .switchIfEmpty(Mono.error(bad("Choose " + ("income".equals(categoryKind) ? "an income" : "a spending")
                        + " category")))
                .map(c -> java.util.Optional.of(c.id()));
    }

    private Mono<List<Portion>> replayPortions(List<PortionRequest> requested, Stored stored) {
        boolean sameShape = stored.portions() != null && stored.portions().size() == requested.size();
        return Flux.range(0, requested.size())
                .concatMap(i -> replayPortion(requested.get(i), sameShape ? stored.portions().get(i) : null))
                .collectList();
    }

    private Mono<Portion> replayPortion(PortionRequest p, Portion saved) {
        BigDecimal amount = amount(p.amount());
        String chosen = chosenClass(p.classification());
        String portionClass = chosen != null ? chosen : saved == null ? null : saved.classification();
        if (p.categoryId() != null) {
            return Mono.just(new Portion(p.categoryId(), portionClass, amount));
        }
        if (p.category() == null || p.category().isBlank()) {
            return Mono.error(bad("Choose a spending category for each portion"));
        }
        return categories.findAnyByKindAndName("spending", p.category().strip(),
                        saved == null ? Stored.NONE : saved.categoryId())
                .switchIfEmpty(Mono.error(bad("Choose a spending category for each portion")))
                .map(c -> new Portion(c.id(), portionClass, amount));
    }

    private static String replayClass(String kind, String requested, String storedClass) {
        String chosen = chosenClass(requested);
        if ("income".equals(kind)) {
            if (chosen != null) {
                throw bad("An income entry has no Essential or Discretionary choice");
            }
            return null;
        }
        return chosen != null ? chosen : storedClass;
    }

    /** The class a request names, checked; null when it names none. */
    private static String chosenClass(String requested) {
        String chosen = requested == null || requested.isBlank() ? null : requested;
        if (chosen != null && !CategoryService.CLASSES.contains(chosen)) {
            throw bad("Choose Essential or Discretionary");
        }
        return chosen;
    }

    /** A reminder is dated after today and is saved as a plan; its kind must be expense or income. */
    public Mono<Entry> parseReminder(Account account, String kind, ExpenseRequest request) {
        if (!"expense".equals(kind) && !"income".equals(kind)) {
            return Mono.error(bad("Choose expense or income"));
        }
        return parse(account, kind, request, true, Set.of(), false);
    }

    private Mono<Entry> parse(Account account, String kind, ExpenseRequest request, boolean reminder,
            Set<UUID> kept, boolean splittable) {
        boolean split = request.portions() != null && !request.portions().isEmpty();
        if (split && !splittable) {
            return Mono.error(bad("This entry cannot be split across categories"));
        }
        return Mono.fromCallable(() -> {
            if ("income".equals(kind) && AccountType.isCard(account.type())) {
                throw bad("A card records purchases, refunds and payments, not income");
            }
            BigDecimal amount = amount(request.amount());
            checkDate(account, request.occurredOn(), reminder);
            if (split) {
                checkSplitShape(kind, request);
            }
            return new Object[] { amount, description(request.description()) };
        }).flatMap(parts -> split
                ? portions(request.portions(), (BigDecimal) parts[0], kept)
                        .flatMap(list -> member(account, request.enteredByMemberId())
                                .map(memberId -> new Entry(account.id(), kind, (BigDecimal) parts[0],
                                        request.occurredOn(), (String) parts[1], null, memberId, null, list)))
                : category(kind, request, reminder, kept)
                        .flatMap(category -> member(account, request.enteredByMemberId())
                                .map(memberId -> new Entry(account.id(), kind, (BigDecimal) parts[0],
                                        request.occurredOn(), (String) parts[1],
                                        category.map(Category::id).orElse(null), memberId,
                                        classification(kind, request, category.orElse(null)), List.of()))));
    }

    /** A split is an expense with 2 to 20 portions, and the payment itself names no category or class. */
    private static void checkSplitShape(String kind, ExpenseRequest request) {
        if (!"expense".equals(kind)) {
            throw bad("Only an expense can be split across categories");
        }
        boolean named = request.categoryId() != null || request.category() != null && !request.category().isBlank();
        if (named || request.classification() != null && !request.classification().isBlank()) {
            throw bad("A split expense has its category and class on each portion, not on the payment");
        }
        if (request.portions().size() < 2) {
            throw bad("A split needs at least two portions");
        }
        if (request.portions().size() > MAX_PORTIONS) {
            throw bad("A split has at most " + MAX_PORTIONS + " portions");
        }
    }

    /**
     * The portions of a split: each a spending category and an amount above zero, adding up
     * to the payment (SPLITS_003). The categories are read under a share lock, lowest id first (D-034). A category may
     * repeat: after a merge two portions can sit in one category.
     */
    private Mono<List<Portion>> portions(List<PortionRequest> requested, BigDecimal total, Set<UUID> kept) {
        BigDecimal assigned = BigDecimal.ZERO;
        List<BigDecimal> amounts = new ArrayList<>();
        for (PortionRequest p : requested) {
            BigDecimal amount = amount(p.amount());
            amounts.add(amount);
            assigned = assigned.add(amount);
        }
        if (assigned.compareTo(total) != 0) {
            throw bad(assigned.compareTo(total) < 0
                    ? "$" + Money.format(assigned) + " is assigned and $" + Money.format(total.subtract(assigned))
                            + " is still to assign"
                    : "$" + Money.format(assigned.subtract(total)) + " more is assigned than the payment");
        }
        return Flux.fromIterable(requested).concatMap(this::portionCategoryId).collectList().flatMap(ids -> {
            List<UUID> locked = ids.stream().distinct().sorted().toList();
            return categoryStore.lockShared(locked).collectMap(Category::id).flatMap(rows -> {
                List<Portion> list = new ArrayList<>();
                for (int i = 0; i < ids.size(); i++) {
                    Category c = rows.get(ids.get(i));
                    PortionRequest p = requested.get(i);
                    checkPortionCategory(c, p, kept);
                    list.add(new Portion(c.id(), portionClass(p, c), amounts.get(i)));
                }
                return Mono.just(list);
            });
        });
    }

    /** The id a portion names (by id, or by the active name, read unlocked: the lock by id follows). */
    private Mono<UUID> portionCategoryId(PortionRequest p) {
        if (p.categoryId() != null) {
            return Mono.just(p.categoryId());
        }
        if (p.category() == null || p.category().isBlank()) {
            return Mono.error(bad("Choose a spending category for each portion"));
        }
        return categoryStore.activeIdByName("spending", p.category().strip())
                .switchIfEmpty(Mono.error(bad("Choose a spending category for each portion")));
    }

    private static void checkPortionCategory(Category c, PortionRequest p, Set<UUID> kept) {
        if (c == null || !"spending".equals(c.kind())) {
            throw bad("Choose a spending category for each portion");
        }
        boolean byName = p.categoryId() == null;
        if (byName && !c.name().equals(p.category().strip())) {
            throw bad("Choose a spending category for each portion");
        }
        if (c.archived() && !kept.contains(c.id())) {
            throw bad("\"" + c.name() + "\" is archived. Choose another category");
        }
    }

    private static String portionClass(PortionRequest p, Category c) {
        String chosen = p.classification() == null || p.classification().isBlank() ? null : p.classification();
        if (chosen != null && !CategoryService.CLASSES.contains(chosen)) {
            throw bad("Choose Essential or Discretionary");
        }
        return chosen != null ? chosen : c.defaultClass();
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
    private Mono<java.util.Optional<Category>> category(String kind, ExpenseRequest request, boolean reminder,
            Set<UUID> kept) {
        String categoryKind = "income".equals(kind) ? "income" : "spending";
        boolean named = request.categoryId() != null || request.category() != null && !request.category().isBlank();
        if (!named && "expense".equals(kind) && !reminder) {
            return Mono.just(java.util.Optional.empty());
        }
        return find(categoryKind, request, named).filter(c -> categoryKind.equals(c.kind()))
                .switchIfEmpty(Mono.error(bad("Choose " + ("income".equals(categoryKind) ? "an income" : "a spending")
                        + " category")))
                .flatMap(c -> c.archived() && !kept.contains(c.id())
                        ? Mono.<Category>error(bad("\"" + c.name() + "\" is archived. Choose another category"))
                        : Mono.just(c))
                .map(java.util.Optional::of);
    }

    /** Read under a share lock inside the save's transaction, so an archive or merge cannot slip in (D-034). */
    private Mono<Category> find(String categoryKind, ExpenseRequest request, boolean named) {
        if (request.categoryId() != null) {
            return categories.findByIdForShare(request.categoryId());
        }
        return named ? categories.findActiveByKindAndName(categoryKind, request.category().strip()) : Mono.empty();
    }

    /** The same rule for the portions of a replacement, read again under the locks (lowest id first, D-034). */
    public Mono<Void> checkPortionCategoriesLocked(List<Portion> portions, Set<UUID> kept) {
        if (portions.isEmpty()) {
            return Mono.empty();
        }
        return categoryStore.lockShared(portions.stream().map(Portion::categoryId).sorted().toList())
                .concatMap(c -> c.archived() && !kept.contains(c.id())
                        ? Mono.<Void>error(bad("\"" + c.name() + "\" is archived. Choose another category"))
                        : Mono.<Void>empty())
                .then();
    }

    /** The same rule for a replacement, read again under the locks it takes (the first read was outside them). */
    public Mono<Void> checkCategoryLocked(UUID categoryId, UUID keptCategoryId) {
        if (categoryId == null || categoryId.equals(keptCategoryId)) {
            return Mono.empty();
        }
        return categories.findByIdForShare(categoryId).flatMap(c -> c.archived()
                ? Mono.<Void>error(bad("\"" + c.name() + "\" is archived. Choose another category"))
                : Mono.<Void>empty());
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
        return memberLocked(account.householdId(), memberId);
    }

    /** The same rule for a write that belongs to the household, not to one account (a Budget). */
    public Mono<UUID> memberLocked(UUID householdId, UUID memberId) {
        if (memberId == null) {
            return Mono.error(bad("Choose who entered this"));
        }
        return members.findByIdForShare(memberId).filter(m -> m.householdId().equals(householdId))
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
