package com.mdstech.wealthmesh.category.service;

import java.time.Clock;
import java.util.Set;

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

    /** All categories, or only one kind ("spending" or "income"). */
    public Flux<CategoryResponse> list(String kind) {
        var found = kind == null || kind.isBlank() ? categories.findAllByOrderBySortOrder()
                : categories.findAllByKindOrderBySortOrder(kind);
        return found.map(CategoryService::response);
    }

    /**
     * Creates a category. A blank name is 400 ("Enter a category name"); a name that already exists for the kind,
     * ignoring case and spaces, is 409 and points to the existing one (CATEGORIES_008). The member is read under a
     * share lock so a deactivate cannot slip in before the save (D-034).
     */
    public Mono<CategoryResponse> create(CategoryRequest request) {
        return Mono.fromCallable(() -> validate(request))
                .flatMap(parts -> transactions.transactional(member(request).then(Mono.defer(() -> store
                        .findDuplicate(parts.kind(), parts.name()).flatMap(existing -> Mono.<Category>error(
                                duplicate(existing)))
                        .switchIfEmpty(Mono.defer(() -> store.insert(parts.name(), parts.kind(), parts.defaultClass())))
                        .flatMap(created -> store.recordEvent(created.id(), "created", null, created.name(), null,
                                request.enteredByMemberId(), clock.instant()).thenReturn(created))))
                        .onErrorMap(DuplicateKeyException.class,
                                e -> new ResponseStatusException(HttpStatus.CONFLICT,
                                        "\"" + parts.name() + "\" already exists. Use that category instead."))))
                .map(CategoryService::response);
    }

    private record Parts(String name, String kind, String defaultClass) {
    }

    private static Parts validate(CategoryRequest request) {
        String name = request.name() == null ? "" : request.name().strip();
        if (name.isEmpty()) {
            throw bad("Enter a category name");
        }
        if (name.length() > 80) {
            throw bad("A category name must be 80 characters or fewer");
        }
        String kind = request.kind();
        if (!"spending".equals(kind) && !"income".equals(kind)) {
            throw bad("Choose spending or income");
        }
        return new Parts(name, kind, defaultClass(kind, request.defaultClass()));
    }

    /** Blank means no default; an income category may have none, a spending one Essential or Discretionary. */
    private static String defaultClass(String kind, String chosen) {
        String defaultClass = chosen == null || chosen.isBlank() ? null : chosen;
        if (defaultClass != null && !CLASSES.contains(defaultClass)) {
            throw bad("Choose Essential or Discretionary");
        }
        if ("income".equals(kind) && defaultClass != null) {
            throw bad("An income category has no Essential or Discretionary choice");
        }
        return defaultClass;
    }

    private Mono<Void> member(CategoryRequest request) {
        if (request.enteredByMemberId() == null) {
            return Mono.error(bad("Choose who entered this"));
        }
        return members.findByIdForShare(request.enteredByMemberId())
                .switchIfEmpty(Mono.error(bad("Choose who entered this from this household")))
                .flatMap(m -> m.active() ? Mono.<Void>empty() : Mono.error(bad("Choose an active member")));
    }

    private static ResponseStatusException duplicate(Category existing) {
        return new ResponseStatusException(HttpStatus.CONFLICT,
                "\"" + existing.name() + "\" already exists. Use that category instead.");
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    static CategoryResponse response(Category c) {
        return new CategoryResponse(c.id(), c.name(), c.kind(), c.defaultClass());
    }
}
