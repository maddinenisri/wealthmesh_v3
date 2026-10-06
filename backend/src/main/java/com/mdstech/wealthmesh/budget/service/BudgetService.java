package com.mdstech.wealthmesh.budget.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.service.EntryValidator;
import com.mdstech.wealthmesh.budget.dto.BudgetCopyRequest;
import com.mdstech.wealthmesh.budget.dto.BudgetLine;
import com.mdstech.wealthmesh.budget.dto.BudgetMonth;
import com.mdstech.wealthmesh.budget.dto.BudgetRequest;
import com.mdstech.wealthmesh.budget.dto.BudgetView;
import com.mdstech.wealthmesh.budget.repository.BudgetStore;
import com.mdstech.wealthmesh.category.domain.Category;
import com.mdstech.wealthmesh.category.repository.CategoryRepository;
import com.mdstech.wealthmesh.category.repository.CategoryStore;
import com.mdstech.wealthmesh.household.repository.HouseholdLock;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * A household Budget per month: a total and category targets, compared with the month's spending. Spending is the
 * one shared definition (`ActivityStore.totalsByCategory`, which reads the `activity_part` view, nets refunds and
 * resolves merged categories, D-039 and D-042); no Budget SQL repeats it. Every write takes the household row
 * `FOR UPDATE` first, reads its key under that lock (D-024), then reads the member and the categories under share
 * locks (D-034, D-042). A Budget is removed softly, and Undo returns the same targets (D-044).
 */
@Service
public class BudgetService {

    private static final Duration KEY_LIFETIME = Duration.ofHours(24);
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    /** A view and whether this call applied a change (false on a replay of a saved key). */
    public record Saved(BudgetView view, boolean created) {
    }

    private final BudgetStore store;
    private final HouseholdLock householdLock;
    private final ActivityStore activity;
    private final CategoryStore categories;
    private final CategoryRepository categoryRepository;
    private final EntryValidator validator;
    private final TransactionalOperator transactions;
    private final Clock clock;

    public BudgetService(BudgetStore store, HouseholdLock householdLock, ActivityStore activity,
            CategoryStore categories,
            CategoryRepository categoryRepository, EntryValidator validator, TransactionalOperator transactions,
            Clock clock) {
        this.store = store;
        this.householdLock = householdLock;
        this.activity = activity;
        this.categories = categories;
        this.categoryRepository = categoryRepository;
        this.validator = validator;
        this.transactions = transactions;
        this.clock = clock;
    }

    /** The months that have a saved Budget, newest first. */
    public Flux<BudgetMonth> months() {
        return store.activeBudgets().map(b -> new BudgetMonth(YearMonth.from(b.month()).toString(),
                Money.format(b.total())));
    }

    /** A month's Budget (when saved) beside its spending, and the changes made to it. */
    public Mono<BudgetView> view(String month) {
        return Mono.fromCallable(() -> parse(month)).flatMap(this::view);
    }

    private Mono<BudgetView> view(YearMonth month) {
        LocalDate first = month.atDay(1);
        return Mono.zip(store.active(first).map(java.util.Optional::of).defaultIfEmpty(java.util.Optional.empty()),
                        activity.totalsByCategory("expense", first, month.plusMonths(1).atDay(1), null).collectList(),
                        store.events(first).collectList(),
                        store.latestRemoved(first).map(Optional::of).defaultIfEmpty(Optional.empty()))
                .flatMap(parts -> {
                    var budget = parts.getT1();
                    Mono<List<BudgetStore.Target>> targets = budget.isPresent()
                            ? store.targets(budget.get().id()).collectList() : Mono.just(List.of());
                    // The removed Budget Undo would bring back, so its review can name the amounts.
                    Mono<Optional<BudgetView.Removed>> removed = budget.isEmpty() && parts.getT4().isPresent()
                            ? store.targets(parts.getT4().get().id()).collectList().map(t -> Optional.of(
                                    new BudgetView.Removed(Money.format(parts.getT4().get().total()),
                                            Money.format(sum(t)), t.size())))
                            : Mono.just(Optional.empty());
                    return Mono.zip(targets, removed).map(both -> assemble(month, budget.orElse(null),
                            parts.getT2(), both.getT1(), parts.getT3(), both.getT2().orElse(null)));
                });
    }

    private static BudgetView assemble(YearMonth month, BudgetStore.Row budget, List<ActivityStore.CategoryTotal> spent,
            List<BudgetStore.Target> targets, List<com.mdstech.wealthmesh.budget.dto.BudgetEventView> history,
            BudgetView.Removed removed) {
        BigDecimal spending = spent.stream().map(ActivityStore.CategoryTotal::total).reduce(BigDecimal.ZERO,
                BigDecimal::add);
        if (budget == null) {
            return new BudgetView(month.toString(), false, null, null, null, null, Money.format(spending), null, null,
                    List.of(), history, removed != null, removed);
        }
        Map<UUID, BudgetStore.Target> targetOf = new LinkedHashMap<>();
        targets.forEach(t -> targetOf.put(t.categoryId(), t));
        List<BudgetLine> lines = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();
        for (ActivityStore.CategoryTotal row : spent) {
            BudgetStore.Target target = row.categoryId() == null ? null : targetOf.get(row.categoryId());
            if (row.categoryId() != null) {
                seen.add(row.categoryId());
            }
            lines.add(line(row.categoryId(), row.name(), row.archived(), target == null ? null : target.amount(),
                    row.total(), row.count()));
        }
        targets.stream().filter(t -> !seen.contains(t.categoryId())).forEach(t -> lines
                .add(line(t.categoryId(), t.name(), t.archived(), t.amount(), BigDecimal.ZERO, 0)));
        lines.sort(Comparator.comparing((BudgetLine l) -> Money.parse(l.spending()).orElseThrow()).reversed()
                .thenComparing(BudgetLine::name));
        BigDecimal targetTotal = targets.stream().map(BudgetStore.Target::amount).reduce(BigDecimal.ZERO,
                BigDecimal::add);
        int compared = spending.compareTo(budget.total());
        return new BudgetView(month.toString(), true, budget.id(), Money.format(budget.total()),
                Money.format(targetTotal), Money.format(budget.total().subtract(targetTotal)), Money.format(spending),
                compared > 0 ? "over" : compared < 0 ? "under" : "on",
                Money.format(spending.subtract(budget.total()).abs()), lines, history, false, null);
    }

    private static BudgetLine line(UUID id, String name, boolean archived, BigDecimal target, BigDecimal spending,
            long count) {
        String state;
        Integer percent = null;
        if (target == null) {
            state = "none";
        } else if (target.signum() == 0) {
            state = spending.signum() > 0 ? "unplanned" : "noSpending";
        } else {
            int compared = spending.compareTo(target);
            state = compared > 0 ? "over" : compared < 0 ? "left" : "on";
            percent = spending.multiply(HUNDRED).divide(target, 0, RoundingMode.HALF_UP).intValue();
        }
        BigDecimal difference = target == null || target.signum() == 0 ? spending.abs()
                : spending.subtract(target).abs();
        return new BudgetLine(id, name, archived, target == null ? null : Money.format(target),
                Money.format(spending), count, state, Money.format(difference), percent);
    }

    /**
     * What the month would look like if the request were saved (the review before Confirm): the same figures as a
     * saved Budget, computed from the request, nothing written. The save recomputes under its lock (D-028).
     */
    public Mono<BudgetView> review(String month, BudgetRequest request) {
        return Mono.fromCallable(() -> new Parsed(parse(month), request)).flatMap(parsed -> {
            LocalDate first = parsed.month.atDay(1);
            return checked(List.copyOf(parsed.targets.keySet()), false).flatMap(found -> activity
                    .totalsByCategory("expense", first, parsed.month.plusMonths(1).atDay(1), null).collectList()
                    .map(spent -> assemble(parsed.month,
                            new BudgetStore.Row(null, first, parsed.total, null), spent,
                            found.stream().map(c -> new BudgetStore.Target(c.id(), c.name(), c.archived(),
                                    parsed.targets.get(c.id()))).toList(), List.of(), null)));
        });
    }

    /** Saves a month's Budget (a new one, or replaces the total and targets of the saved one). */
    public Mono<Saved> save(String month, String key, BudgetRequest request) {
        return Mono.fromCallable(() -> {
            requireKey(key);
            return new Parsed(parse(month), request);
        }).flatMap(parsed -> {
            Instant now = clock.instant();
            Instant cutoff = now.minus(KEY_LIFETIME);
            String fingerprint = "save|" + parsed.month + "|" + parsed.total + "|" + parsed.targets.entrySet().stream()
                    .map(e -> e.getKey() + "=" + e.getValue()).sorted().collect(Collectors.joining(","));
            return locked(key, cutoff, parsed.month, fingerprint, request.enteredByMemberId(), householdId ->
                    checked(List.copyOf(parsed.targets.keySet()), true).flatMap(found -> store
                            .active(parsed.month.atDay(1)).map(Optional::of).defaultIfEmpty(Optional.empty())
                            .flatMap(existing -> applySave(householdId, parsed, found, existing, now, key,
                                    fingerprint, request.enteredByMemberId()))));
        });
    }

    /** Writes the save: a new Budget, or the saved one's total and targets replaced, and the event that says what. */
    private Mono<Void> applySave(UUID householdId, Parsed parsed, List<Category> found,
            Optional<BudgetStore.Row> existing, Instant now, String key, String fingerprint, UUID memberId) {
        Map<UUID, String> names = found.stream().collect(Collectors.toMap(Category::id, Category::name));
        Mono<List<BudgetStore.Target>> before = existing.isPresent()
                ? store.targets(existing.get().id()).collectList() : Mono.just(List.of());
        return before.flatMap(previous -> {
            previous.forEach(t -> names.putIfAbsent(t.categoryId(), t.name()));
            String detail = existing.isPresent()
                    ? changes(existing.get().total(), previous, parsed.total, parsed.targets, names)
                    : describe(parsed.total, parsed.targets.values());
            Mono<UUID> budgetId = existing.isPresent()
                    ? store.setTotal(existing.get().id(), parsed.total)
                            .then(Mono.defer(() -> store.deleteTargets(existing.get().id())))
                            .thenReturn(existing.get().id())
                    : store.insert(householdId, parsed.month.atDay(1), parsed.total, now);
            return budgetId.flatMap(id -> Flux.fromIterable(parsed.targets.entrySet())
                    .concatMap(e -> store.insertTarget(id, e.getKey(), e.getValue()))
                    .then(Mono.defer(() -> store.recordEvent(id, "saved", memberId, now, key, fingerprint,
                            detail))));
        });
    }

    private static String dollars(BigDecimal amount) {
        return String.format(java.util.Locale.US, "$%,.2f", amount);
    }

    private static BigDecimal sum(Collection<BudgetStore.Target> targets) {
        return targets.stream().map(BudgetStore.Target::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** "Total $3,600.00; 6 targets totaling $3,600.00". */
    private static String describe(BigDecimal total, Collection<BigDecimal> targets) {
        BigDecimal sum = targets.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return "Total " + dollars(total) + "; " + targets.size() + (targets.size() == 1 ? " target" : " targets")
                + " totaling " + dollars(sum);
    }

    /** What a save changed: the total and each target that was added, changed or removed. */
    private static String changes(BigDecimal oldTotal, List<BudgetStore.Target> previous, BigDecimal newTotal,
            Map<UUID, BigDecimal> targets, Map<UUID, String> names) {
        List<String> parts = new ArrayList<>();
        parts.add(oldTotal.compareTo(newTotal) == 0 ? "Total " + dollars(newTotal) + " unchanged"
                : "Total " + dollars(oldTotal) + " to " + dollars(newTotal));
        Map<UUID, BigDecimal> old = previous.stream()
                .collect(Collectors.toMap(BudgetStore.Target::categoryId, BudgetStore.Target::amount));
        targets.forEach((id, amount) -> {
            BigDecimal was = old.get(id);
            if (was == null) {
                parts.add(names.get(id) + " target added " + dollars(amount));
            } else if (was.compareTo(amount) != 0) {
                parts.add(names.get(id) + " target " + dollars(was) + " to " + dollars(amount));
            }
        });
        old.forEach((id, was) -> {
            if (!targets.containsKey(id)) {
                parts.add(names.get(id) + " target " + dollars(was) + " removed");
            }
        });
        return String.join("; ", parts);
    }

    /** Copies one month's Budget (total and targets, not spending) into a month that has none. */
    public Mono<Saved> copy(String month, String key, BudgetCopyRequest request) {
        return Mono.fromCallable(() -> {
            requireKey(key);
            if (request == null) {
                throw bad("Choose the month to copy");
            }
            return new YearMonth[] {parse(month), parse(request.fromMonth())};
        }).flatMap(months -> {
            if (months[0].equals(months[1])) {
                return Mono.<Saved>error(bad("Choose a different month to copy from"));
            }
            Instant now = clock.instant();
            Instant cutoff = now.minus(KEY_LIFETIME);
            String fingerprint = "copy|" + months[0] + "|" + months[1];
            return locked(key, cutoff, months[0], fingerprint, request.enteredByMemberId(), householdId ->
                    store.active(months[0].atDay(1)).hasElement().flatMap(exists -> exists
                            ? Mono.<Void>error(conflict("A Budget for " + months[0] + " already exists"))
                            : store.active(months[1].atDay(1))
                                    .switchIfEmpty(Mono.error(notFound("No Budget for " + months[1] + " to copy")))
                                    .flatMap(source -> applyCopy(householdId, months, source, now, key, fingerprint,
                                            request.enteredByMemberId()))));
        });
    }

    private Mono<Void> applyCopy(UUID householdId, YearMonth[] months, BudgetStore.Row source, Instant now,
            String key, String fingerprint, UUID memberId) {
        return store.targets(source.id()).collectList().flatMap(targets -> {
            String from = months[1].getMonth().getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.US)
                    + " " + months[1].getYear();
            String detail = "Copied from " + from + ". "
                    + describe(source.total(), targets.stream().map(BudgetStore.Target::amount).toList());
            return store.insert(householdId, months[0].atDay(1), source.total(), now)
                    .flatMap(id -> Flux.fromIterable(targets)
                            .concatMap(t -> store.insertTarget(id, t.categoryId(), t.amount()))
                            .then(Mono.defer(() -> store.recordEvent(id, "copied", memberId, now, key, fingerprint,
                                    detail))));
        });
    }

    /** Removes a month's Budget (soft); a repeat returns the same result. Spending is untouched. */
    public Mono<BudgetView> remove(String month, UUID memberId) {
        return Mono.fromCallable(() -> parse(month)).flatMap(ym -> transactions.transactional(householdLock.lock()
                .flatMap(householdId -> validator.memberLocked(householdId, memberId))
                .then(Mono.defer(() -> store.active(ym.atDay(1)).map(Optional::of).defaultIfEmpty(Optional.empty())))
                .flatMap(active -> {
                    if (active.isPresent()) {
                        Instant now = clock.instant();
                        return store.targets(active.get().id()).collectList().flatMap(targets -> store
                                .setRemoved(active.get().id(), now)
                                .then(Mono.defer(() -> store.recordEvent(active.get().id(), "removed", memberId,
                                        now, null, null, describe(active.get().total(), targets.stream()
                                                .map(BudgetStore.Target::amount).toList())))));
                    }
                    // Already removed: the same result again (nothing recorded); never saved: 404.
                    return store.latestRemoved(ym.atDay(1))
                            .switchIfEmpty(Mono.error(notFound("No Budget for " + ym))).then();
                })
                .then(Mono.defer(() -> view(ym)))));
    }

    /** Brings back the month's removed Budget with its original targets; a repeat Undo returns the same result. */
    public Mono<BudgetView> undo(String month, UUID memberId) {
        return Mono.fromCallable(() -> parse(month)).flatMap(ym -> transactions.transactional(householdLock.lock()
                .flatMap(householdId -> validator.memberLocked(householdId, memberId))
                .then(Mono.defer(() -> store.active(ym.atDay(1)).map(Optional::of).defaultIfEmpty(Optional.empty())))
                .flatMap(active -> {
                    if (active.isPresent()) {
                        // The month has a Budget: only a Budget this very Undo restored makes it a repeat (D-044).
                        return store.latestAction(active.get().id()).filter("restored"::equals)
                                .switchIfEmpty(Mono.error(conflict(ym + " already has a Budget. Remove it first.")))
                                .then();
                    }
                    return store.latestRemoved(ym.atDay(1))
                            .switchIfEmpty(Mono.error(notFound("No removed Budget for " + ym)))
                            .flatMap(removed -> {
                                Instant now = clock.instant();
                                return store.targets(removed.id()).collectList().flatMap(targets -> store
                                        .setRemoved(removed.id(), null)
                                        .then(Mono.defer(() -> store.recordEvent(removed.id(), "restored", memberId,
                                                now, null, null, describe(removed.total(), targets.stream()
                                                        .map(BudgetStore.Target::amount).toList())))));
                            });
                })
                .then(Mono.defer(() -> view(ym)))));
    }

    /**
     * Runs a keyed write under the household lock: a stored key replays (same fingerprint) or is refused (other
     * details); a new key reads the member, then applies the write.
     */
    private Mono<Saved> locked(String key, Instant cutoff, YearMonth month, String fingerprint, UUID memberId,
            java.util.function.Function<UUID, Mono<Void>> apply) {
        return transactions.transactional(householdLock.lock()
                .flatMap(householdId -> store.expireKey(key, cutoff)
                        .then(Mono.defer(() -> store.findKey(key)))
                        .flatMap(hit -> hit.fingerprint().equals(fingerprint)
                                ? view(month).map(v -> new Saved(v, false))
                                : Mono.<Saved>error(conflict(
                                        "This save was already used with different details. Start a new entry.")))
                        .switchIfEmpty(Mono.defer(() -> validator.memberLocked(householdId, memberId)
                                .then(Mono.defer(() -> apply.apply(householdId)))
                                .then(Mono.defer(() -> view(month)))
                                .map(v -> new Saved(v, true))))));
    }

    /** The categories read under a share lock, lowest id first; a merged one is refused (use its target, Q-041). */
    private Mono<Void> checkCategories(List<UUID> ids) {
        return checked(ids, true).then();
    }

    /**
     * The named categories, each checked as a target; `lock` reads them under a share lock (a save), else plain (a
     * review).
     */
    private Mono<List<Category>> checked(List<UUID> ids, boolean lock) {
        if (ids.isEmpty()) {
            return Mono.just(List.of());
        }
        return (lock ? categories.lockShared(ids) : categoryRepository.findAllById(ids)).collectList()
                .flatMap(found -> validTargets(ids, found));
    }

    private Mono<List<Category>> validTargets(List<UUID> ids, List<Category> found) {
        Map<UUID, Category> byId = found.stream().collect(Collectors.toMap(Category::id, c -> c));
        for (UUID id : ids) {
            Category category = byId.get(id);
            if (category == null || !"spending".equals(category.kind())) {
                return Mono.error(bad("Choose a spending category for each target"));
            }
            if (category.mergedIntoId() != null) {
                return categoryRepository.findById(category.mergedIntoId()).map(Category::name)
                        .defaultIfEmpty("its target").flatMap(target -> Mono.<List<Category>>error(bad(
                                category.name() + " was merged into " + target + ". Set the target on " + target
                                + " instead.")));
            }
        }
        return Mono.just(found);
    }

    private record Parsed(YearMonth month, BigDecimal total, Map<UUID, BigDecimal> targets) {
        Parsed(YearMonth month, BudgetRequest request) {
            this(month, amount(request == null ? null : request.total()), targetsOf(request));
        }
    }

    private static Map<UUID, BigDecimal> targetsOf(BudgetRequest request) {
        Map<UUID, BigDecimal> targets = new LinkedHashMap<>();
        if (request == null || request.targets() == null) {
            return targets;
        }
        for (BudgetRequest.Target target : request.targets()) {
            if (target == null || target.categoryId() == null) {
                throw bad("Choose a category for each target");
            }
            if (targets.put(target.categoryId(), amount(target.amount())) != null) {
                throw bad("Each category can have one target");
            }
        }
        return targets;
    }

    /** Zero or a positive amount; anything else is the same sentence the screen shows (BUDGET_007). */
    private static BigDecimal amount(Object value) {
        if (!(value instanceof String text) || Money.parse(text).isEmpty()) {
            throw bad("Enter a valid amount");
        }
        BigDecimal amount = Money.parse(text).orElseThrow();
        if (amount.signum() < 0) {
            throw bad("Enter zero or a positive amount");
        }
        return amount;
    }

    private static void requireKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw bad("Missing save key");
        }
    }

    private static YearMonth parse(String month) {
        try {
            return YearMonth.parse(month);
        } catch (DateTimeParseException | NullPointerException e) {
            throw bad("Choose a month like 2026-09");
        }
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
