package com.mdstech.wealthmesh.category.service;

import java.time.Clock;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.category.domain.Category;
import com.mdstech.wealthmesh.category.dto.CategoryRequest;
import com.mdstech.wealthmesh.category.dto.CategoryResponse;
import com.mdstech.wealthmesh.category.repository.CategoryRepository;
import com.mdstech.wealthmesh.category.repository.CategoryStore;
import com.mdstech.wealthmesh.household.repository.HouseholdMemberRepository;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** The category list: reading it and creating categories (D-020 seeded the first ones). */
@Service
public class CategoryService {

    /** The classes an expense can carry (CATEGORIES_001). */
    public static final Set<String> CLASSES = Set.of("essential", "discretionary");

    /** How a class reads in events and reviews. */
    public static final java.util.Map<String, String> CLASS_LABELS = java.util.Map.of("essential", "Essential",
            "discretionary", "Discretionary");

    private final CategoryRepository categories;
    private final CategoryStore store;
    private final HouseholdMemberRepository members;
    private final TransactionalOperator transactions;
    private final Clock clock;

    public CategoryService(CategoryRepository categories, CategoryStore store, HouseholdMemberRepository members,
            TransactionalOperator transactions, Clock clock) {
        this.categories = categories;
        this.store = store;
        this.members = members;
        this.transactions = transactions;
        this.clock = clock;
    }

    /**
     * The categories offered for new entries, or only one kind ("spending" or "income"). Archived and merged ones
     * are left out unless `includeArchived` is true (the Categories page shows them with their state).
     */
    public Flux<CategoryResponse> list(String kind, boolean includeArchived) {
        boolean all = kind == null || kind.isBlank();
        var found = includeArchived
                ? (all ? categories.findAllByOrderBySortOrder() : categories.findAllByKindOrderBySortOrder(kind))
                : (all ? categories.findActive() : categories.findActiveByKind(kind));
        return found.map(CategoryService::response);
    }

    /**
     * Creates a category. A blank name is 400 ("Enter a category name"); a name that already exists for the kind,
     * ignoring case and spaces, is 409 and points to the existing one (CATEGORIES_008). The member is read under a
     * share lock so a deactivate cannot slip in before the save (D-034).
     */
    public Mono<CategoryResponse> create(CategoryRequest request) {
        return Mono.fromCallable(() -> validate(request))
                .flatMap(parts -> transactions.transactional(member(request.enteredByMemberId())
                        .then(Mono.defer(() -> insert(parts, request.enteredByMemberId()))))
                        .onErrorMap(DuplicateKeyException.class,
                                e -> new ResponseStatusException(HttpStatus.CONFLICT,
                                        "\"" + parts.name() + "\" already exists. Use that category instead.")))
                .map(CategoryService::response);
    }

    private Mono<Category> insert(Parts parts, UUID memberId) {
        return store.findDuplicate(parts.kind(), parts.name(), null)
                .flatMap(existing -> Mono.<Category>error(duplicate(existing)))
                .switchIfEmpty(Mono.defer(() -> store.insert(parts.name(), parts.kind(), parts.defaultClass())))
                .flatMap(created -> store.recordEvent(created.id(), "created", null, created.name(), null, memberId,
                        clock.instant()).thenReturn(created));
    }

    private record Parts(String name, String kind, String defaultClass) {
    }

    /** A trimmed, non-blank name of at most 80 characters (CATEGORIES_008). */
    public static String name(String text) {
        String name = text == null ? "" : text.strip();
        if (name.isEmpty()) {
            throw bad("Enter a category name");
        }
        if (name.length() > 80) {
            throw bad("A category name must be 80 characters or fewer");
        }
        return name;
    }

    private static Parts validate(CategoryRequest request) {
        String name = name(request.name());
        String kind = request.kind();
        if (!"spending".equals(kind) && !"income".equals(kind)) {
            throw bad("Choose spending or income");
        }
        return new Parts(name, kind, defaultClass(kind, request.defaultClass()));
    }

    /** Blank means no default; an income category may have none, a spending one Essential or Discretionary. */
    static String defaultClass(String kind, String chosen) {
        String defaultClass = chosen == null || chosen.isBlank() ? null : chosen;
        if (defaultClass != null && !CLASSES.contains(defaultClass)) {
            throw bad("Choose Essential or Discretionary");
        }
        if ("income".equals(kind) && defaultClass != null) {
            throw bad("An income category has no Essential or Discretionary choice");
        }
        return defaultClass;
    }

    /** Who made the change must be an active member, read under a share lock (D-034). */
    public Mono<Void> member(UUID memberId) {
        if (memberId == null) {
            return Mono.error(bad("Choose who entered this"));
        }
        return members.findByIdForShare(memberId)
                .switchIfEmpty(Mono.error(bad("Choose who entered this from this household")))
                .flatMap(m -> m.active() ? Mono.<Void>empty() : Mono.error(bad("Choose an active member")));
    }

    static ResponseStatusException duplicate(Category existing) {
        return new ResponseStatusException(HttpStatus.CONFLICT,
                "\"" + existing.name() + "\" already exists. Use that category instead.");
    }

    static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    public static CategoryResponse response(Category c) {
        return new CategoryResponse(c.id(), c.name(), c.kind(), c.defaultClass(), c.archived(), c.mergedIntoId(),
                c.mergeId());
    }
}
