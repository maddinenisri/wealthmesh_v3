package com.mdstech.wealthmesh.category.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.category.domain.Category;
import com.mdstech.wealthmesh.category.dto.CategoryChange;
import com.mdstech.wealthmesh.category.dto.CategoryEvent;
import com.mdstech.wealthmesh.category.dto.CategoryMerge;
import com.mdstech.wealthmesh.category.dto.CategoryResponse;
import com.mdstech.wealthmesh.category.dto.CategoryUsage;
import com.mdstech.wealthmesh.category.dto.MergeResult;
import com.mdstech.wealthmesh.category.repository.CategoryStore;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Rename, change the default class of, archive, restore and merge categories (CATEGORIES_002 to 005). Every write
 * names who made it (read under a share lock, D-034), locks the category rows lowest id first and records an event.
 * Each is state-setting: sending the same request twice leaves the same state, so none takes a save key. A merge is
 * a pointer on the sources, never a rewrite of ledger rows, and Undo clears it.
 */
@Service
public class CategoryLifecycleService {

    private final CategoryStore store;
    private final CategoryService categories;
    private final TransactionalOperator transactions;
    private final Clock clock;

    public CategoryLifecycleService(CategoryStore store, CategoryService categories,
            TransactionalOperator transactions, Clock clock) {
        this.store = store;
        this.categories = categories;
        this.transactions = transactions;
        this.clock = clock;
    }

    public Mono<CategoryResponse> rename(UUID id, CategoryChange change) {
        return Mono.fromCallable(() -> CategoryService.name(change.name()))
                .flatMap(name -> write(id, change.enteredByMemberId(), category -> {
                    if (category.name().equals(name)) {
                        return Mono.just(category);
                    }
                    return store.findDuplicate(category.kind(), name, id)
                            .flatMap(existing -> Mono.<Category>error(CategoryService.duplicate(existing)))
                            .then(Mono.defer(() -> store.rename(id, name)))
                            .then(Mono.defer(() -> store.recordEvent(id, "renamed", category.name(), name, null,
                                    change.enteredByMemberId(), clock.instant())))
                            .thenReturn(withName(category, name));
                }))
                .onErrorMap(DuplicateKeyException.class, e -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "That name already exists. Use that category instead."));
    }

    public Mono<CategoryResponse> changeDefault(UUID id, CategoryChange change) {
        return write(id, change.enteredByMemberId(), category -> {
            String chosen = CategoryService.defaultClass(category.kind(), change.defaultClass());
            if (java.util.Objects.equals(chosen, category.defaultClass())) {
                return Mono.just(category);
            }
            return store.setDefaultClass(id, chosen)
                    .then(Mono.defer(() -> store.recordEvent(id, "default_changed", null, null,
                            label(category.defaultClass()) + " to " + label(chosen), change.enteredByMemberId(),
                            clock.instant())))
                    .thenReturn(new Category(category.id(), category.name(), category.kind(), category.sortOrder(),
                            chosen, category.archivedAt(), category.mergedIntoId(), category.mergeId()));
        });
    }

    public Mono<CategoryResponse> archive(UUID id, CategoryChange change) {
        return write(id, change.enteredByMemberId(), category -> {
            if (category.archived()) {
                return Mono.just(category);
            }
            Instant now = clock.instant();
            return store.setArchived(id, now)
                    .then(Mono.defer(() -> store.recordEvent(id, "archived", null, null, null,
                            change.enteredByMemberId(), now)))
                    .thenReturn(withArchived(category, now));
        });
    }

    public Mono<CategoryResponse> restore(UUID id, CategoryChange change) {
        return write(id, change.enteredByMemberId(), category -> {
            if (category.mergedIntoId() != null) {
                return Mono.error(new ResponseStatusException(HttpStatus.CONFLICT,
                        "\"" + category.name() + "\" was merged. Undo the merge instead."));
            }
            if (!category.archived()) {
                return Mono.just(category);
            }
            return store.setArchived(id, null)
                    .then(Mono.defer(() -> store.recordEvent(id, "restored", null, null, null,
                            change.enteredByMemberId(), clock.instant())))
                    .thenReturn(withArchived(category, null));
        });
    }

    /** Merges the sources into an existing target or a new one; the sources are archived and point at it. */
    public Mono<MergeResult> merge(CategoryMerge request) {
        UUID mergeId = UUID.randomUUID();
        return Mono.fromCallable(() -> sources(request))
                .flatMap(sources -> transactions.transactional(categories.member(request.enteredByMemberId())
                        // Every row this merge touches is locked in one statement, lowest id first, so two merges
                        // in opposite directions cannot wait on each other.
                        .then(Mono.defer(() -> store.lock(allIds(request, sources)).then()))
                        .then(Mono.defer(() -> target(request, sources, mergeId)))
                        .flatMap(target -> mergeLocked(request, sources, target, mergeId))));
    }

    private static List<UUID> allIds(CategoryMerge request, List<UUID> sources) {
        return request.targetId() == null ? sources
                : java.util.stream.Stream.concat(sources.stream(), java.util.stream.Stream.of(request.targetId()))
                        .distinct().sorted().toList();
    }

    private Mono<MergeResult> mergeLocked(CategoryMerge request, List<UUID> sources, Category target,
            UUID mergeId) {
        return store.lock(sources).collectList().flatMap(rows -> {
            if (rows.size() != sources.size()) {
                return Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
            }
            return Flux.fromIterable(rows).concatMap(source -> checkSource(source, target)).then(Mono.defer(() -> {
                Instant now = clock.instant();
                return store.merge(sources, target.id(), mergeId, now)
                        .thenMany(Flux.fromIterable(rows).concatMap(source -> store.recordEvent(source.id(),
                                "merged", source.name(), target.name(), "Merged into " + target.name(),
                                request.enteredByMemberId(), now)))
                        .then(Mono.defer(() -> store.recordEvent(target.id(), "merged", null, target.name(),
                                "Merged in " + String.join(", ", rows.stream().map(Category::name).toList()),
                                request.enteredByMemberId(), now)))
                        .thenReturn(new MergeResult(mergeId, CategoryService.response(target)));
            }));
        });
    }

    private Mono<Void> checkSource(Category source, Category target) {
        if (source.archived()) {
            return Mono.error(conflict("\"" + source.name() + "\" is archived or already merged."));
        }
        if (!source.kind().equals(target.kind())) {
            return Mono.error(CategoryService.bad("Merge spending with spending and income with income"));
        }
        return store.isLiveMergeTarget(source.id()).flatMap(live -> live
                ? Mono.error(conflict("Undo the earlier merge into \"" + source.name() + "\" first."))
                : Mono.empty());
    }

    private Mono<Category> target(CategoryMerge request, List<UUID> sources, UUID mergeId) {
        if (request.targetId() != null) {
            if (sources.contains(request.targetId())) {
                return Mono.error(CategoryService.bad("Choose a different category to merge into"));
            }
            return store.lock(List.of(request.targetId())).next()
                    .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND,
                            "Category not found")))
                    .flatMap(target -> target.archived()
                            ? Mono.<Category>error(conflict("\"" + target.name() + "\" is archived."))
                            : Mono.just(target));
        }
        String name = CategoryService.name(request.newName());
        return store.lock(sources).next().switchIfEmpty(Mono.error(new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Category not found")))
                .flatMap(first -> store.findDuplicate(first.kind(), name, null)
                        .flatMap(existing -> Mono.<Category>error(CategoryService.duplicate(existing)))
                        .switchIfEmpty(Mono.defer(() -> store.insert(name, first.kind(), first.defaultClass())))
                        .flatMap(created -> store.recordEvent(created.id(), "created", null, name,
                                CategoryStore.CREATED_BY_MERGE + mergeId, request.enteredByMemberId(),
                                clock.instant()).thenReturn(created)));
    }

    private static List<UUID> sources(CategoryMerge request) {
        List<UUID> ids = request.sourceIds() == null ? List.of() : request.sourceIds().stream().distinct()
                .sorted().toList();
        if (ids.isEmpty()) {
            throw CategoryService.bad("Choose the categories to merge");
        }
        boolean named = request.newName() != null && !request.newName().isBlank();
        if (named == (request.targetId() != null)) {
            throw CategoryService.bad("Choose one category to merge into, or name a new one");
        }
        return ids;
    }

    /** Undo clears the pointer and the archive on every source of the merge; a second Undo is a 409. */
    public Mono<List<CategoryResponse>> undoMerge(UUID mergeId, CategoryChange change) {
        return transactions.transactional(categories.member(change.enteredByMemberId())
                .then(Mono.defer(() -> store.lockMerge(mergeId).collectList()))
                .flatMap(rows -> {
                    if (rows.isEmpty()) {
                        return Mono.<List<CategoryResponse>>error(conflict("This merge was already undone."));
                    }
                    Instant now = clock.instant();
                    return store.undoMerge(mergeId)
                            .then(Mono.defer(() -> archiveEmptyTarget(mergeId, change.enteredByMemberId(), now)))
                            .thenMany(Flux.fromIterable(rows).concatMap(source -> store.recordEvent(source.id(),
                                    "merge_undone", source.name(), null, "Merge undone",
                                    change.enteredByMemberId(), now)))
                            .then(Mono.defer(() -> store.recordEvent(rows.getFirst().mergedIntoId(), "merge_undone",
                                    null, null, "Merge undone", change.enteredByMemberId(), now)))
                            .thenReturn(rows.stream().map(c -> CategoryService.response(
                                    new Category(c.id(), c.name(), c.kind(), c.sortOrder(), c.defaultClass(), null,
                                            null, null))).toList());
                }));
    }

    /**
     * A category made only to receive a merge is archived again when Undo leaves it empty, so Undo does not leave an
     * empty active category behind. One that has entries of its own (saved since the merge) stays.
     */
    private Mono<Void> archiveEmptyTarget(UUID mergeId, UUID memberId, Instant now) {
        return store.createdByMerge(mergeId).flatMap(id -> store.lock(List.of(id)).next())
                .flatMap(target -> store.usage(target).filter(usage -> usage.entries() == 0)
                        .flatMap(usage -> store.setArchived(target.id(), now)
                                .then(store.recordEvent(target.id(), "archived", null, null,
                                        "Empty after the merge was undone", memberId, now))))
                .then();
    }

    public Mono<CategoryUsage> usage(UUID id) {
        return store.lock(List.of(id)).next().switchIfEmpty(notFound()).flatMap(store::usage);
    }

    public Flux<CategoryEvent> history(UUID id) {
        return store.lock(List.of(id)).next().switchIfEmpty(notFound()).thenMany(Flux.defer(() -> store.history(id)));
    }

    /** One change to one category: member, lock, change, event, all in one transaction. */
    private Mono<CategoryResponse> write(UUID id, UUID memberId,
            java.util.function.Function<Category, Mono<Category>> change) {
        return transactions.transactional(categories.member(memberId)
                .then(Mono.defer(() -> store.lock(List.of(id)).next()))
                .switchIfEmpty(notFound())
                .flatMap(change)
                .map(CategoryService::response));
    }

    private static <T> Mono<T> notFound() {
        return Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static String label(String classification) {
        return classification == null ? "none" : CategoryService.CLASS_LABELS.get(classification);
    }

    private static Category withName(Category c, String name) {
        return new Category(c.id(), name, c.kind(), c.sortOrder(), c.defaultClass(), c.archivedAt(),
                c.mergedIntoId(), c.mergeId());
    }

    private static Category withArchived(Category c, Instant at) {
        return new Category(c.id(), c.name(), c.kind(), c.sortOrder(), c.defaultClass(), at, c.mergedIntoId(),
                c.mergeId());
    }
}
