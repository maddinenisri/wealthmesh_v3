package com.mdstech.wealthmesh.household.service;

import java.time.Clock;
import java.util.Objects;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.household.domain.HouseholdMember;
import com.mdstech.wealthmesh.household.repository.HouseholdMemberRepository;
import com.mdstech.wealthmesh.household.repository.MemberNameHistoryStore;
import com.mdstech.wealthmesh.household.dto.HouseholdMemberRequest;
import com.mdstech.wealthmesh.household.dto.HouseholdMemberResponse;
import com.mdstech.wealthmesh.household.mapper.HouseholdMemberMapper;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class HouseholdMemberService {

    private final HouseholdMemberRepository repository;
    private final MemberNameHistoryStore history;
    private final HouseholdMemberMapper mapper;
    private final Clock clock;

    public HouseholdMemberService(HouseholdMemberRepository repository, MemberNameHistoryStore history,
            HouseholdMemberMapper mapper, Clock clock) {
        this.repository = repository;
        this.history = history;
        this.mapper = mapper;
        this.clock = clock;
    }

    public Flux<HouseholdMemberResponse> findAll(UUID householdId) {
        Flux<HouseholdMember> members = householdId == null
                ? repository.findAll()
                : repository.findByHouseholdId(householdId);
        return history.historyByMember().flatMapMany(changes -> members
                .map(member -> mapper.toResponse(member, changes.get(member.id()))));
    }

    public Mono<HouseholdMemberResponse> findById(UUID id) {
        return load(id).flatMap(this::respond);
    }

    public Mono<HouseholdMemberResponse> create(HouseholdMemberRequest request) {
        if (request.householdId() == null) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "householdId is required"));
        }
        return validate(request)
                .then(Mono.defer(() -> repository.save(mapper.toNewEntity(request))))
                .onErrorMap(DataIntegrityViolationException.class, HouseholdMemberService::duplicate)
                .flatMap(this::respond);
    }

    /** A rename keeps the earlier name and label in the profile change history, in the same transaction. */
    @Transactional
    public Mono<HouseholdMemberResponse> update(UUID id, HouseholdMemberRequest request) {
        return validate(request)
                .then(Mono.defer(() -> repository.findByIdForUpdate(id).switchIfEmpty(notFound(id))))
                .flatMap(existing -> {
                    HouseholdMember updated = mapper.toUpdatedEntity(request, existing);
                    Mono<Void> note = sameProfile(existing, updated) ? Mono.empty()
                            : history.record(id, existing.name(), existing.label(), clock.instant());
                    return note.then(Mono.defer(() -> repository.save(updated)));
                })
                .onErrorMap(DataIntegrityViolationException.class, HouseholdMemberService::duplicate)
                .flatMap(this::respond);
    }

    /** Removing a member: they leave new choices but keep ownership and history (foundations 9). */
    @Transactional
    public Mono<HouseholdMemberResponse> deactivate(UUID id) {
        return setActive(id, false);
    }

    @Transactional
    public Mono<HouseholdMemberResponse> restore(UUID id) {
        return setActive(id, true);
    }

    public Mono<Void> delete(UUID id) {
        return load(id).flatMap(repository::delete)
                .onErrorMap(DataIntegrityViolationException.class, e -> new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "This member is on your accounts or records and cannot be deleted. "
                                + "Deactivate this member instead.", e));
    }

    private Mono<HouseholdMemberResponse> setActive(UUID id, boolean active) {
        return repository.findByIdForUpdate(id).switchIfEmpty(notFound(id))
                .flatMap(existing -> existing.active() == active ? Mono.just(existing)
                        : repository.save(new HouseholdMember(existing.id(), existing.householdId(),
                                existing.name(), existing.label(), existing.nameKey(), existing.labelKey(),
                                active, existing.createdAt(), clock.instant())))
                .flatMap(this::respond);
    }

    private Mono<HouseholdMemberResponse> respond(HouseholdMember member) {
        return history.historyByMember().map(changes -> mapper.toResponse(member, changes.get(member.id())));
    }

    private static boolean sameProfile(HouseholdMember before, HouseholdMember after) {
        return before.name().equals(after.name()) && Objects.equals(before.label(), after.label());
    }

    static Mono<Void> validate(HouseholdMemberRequest request) {
        String name = request.name() == null ? "" : request.name().strip();
        String label = request.label() == null ? "" : request.label().strip();
        if (name.isEmpty() || name.length() > 120) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Member name must be 1 to 120 characters"));
        }
        if (label.length() > 80) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Label must be 80 characters or fewer"));
        }
        return Mono.empty();
    }

    private static ResponseStatusException duplicate(DataIntegrityViolationException e) {
        return new ResponseStatusException(HttpStatus.CONFLICT,
                "A member with this name and label already exists, or the household does not exist", e);
    }

    private Mono<HouseholdMember> load(UUID id) {
        return repository.findById(id).switchIfEmpty(notFound(id));
    }

    private static <T> Mono<T> notFound(UUID id) {
        return Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Household member not found: " + id));
    }
}
