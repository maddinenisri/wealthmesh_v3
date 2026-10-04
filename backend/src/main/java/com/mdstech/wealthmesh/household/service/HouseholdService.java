package com.mdstech.wealthmesh.household.service;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.household.domain.Household;
import com.mdstech.wealthmesh.household.dto.HouseholdRequest;
import com.mdstech.wealthmesh.household.dto.HouseholdResponse;
import com.mdstech.wealthmesh.household.mapper.HouseholdMapper;
import com.mdstech.wealthmesh.household.repository.HouseholdRepository;

import reactor.core.publisher.Mono;

/** The app has a single household; the database enforces it with a unique singleton column. */
@Service
public class HouseholdService {

    private final HouseholdRepository repository;
    private final HouseholdMapper mapper;

    public HouseholdService(HouseholdRepository repository, HouseholdMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    public Mono<HouseholdResponse> get() {
        return load().map(mapper::toResponse);
    }

    public Mono<HouseholdResponse> create(HouseholdRequest request) {
        return validate(request).then(Mono.defer(() -> repository.save(mapper.toNewEntity(request))
                .onErrorMap(DataIntegrityViolationException.class, e -> new ResponseStatusException(
                        HttpStatus.CONFLICT, "A household already exists", e))
                .map(mapper::toResponse)));
    }

    public Mono<HouseholdResponse> rename(HouseholdRequest request) {
        return validate(request).then(Mono.defer(() -> load()
                .flatMap(existing -> repository.save(mapper.toUpdatedEntity(request, existing)))
                .map(mapper::toResponse)));
    }

    private static Mono<Void> validate(HouseholdRequest request) {
        String name = request.name() == null ? "" : request.name().strip();
        if (name.isEmpty() || name.length() > 120) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Household name must be 1 to 120 characters"));
        }
        return Mono.empty();
    }

    private Mono<Household> load() {
        return repository.findAll().next().switchIfEmpty(Mono.error(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "No household has been created yet")));
    }
}
