package com.mdstech.wealthmesh.household;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.household.dto.HouseholdMemberRequest;
import com.mdstech.wealthmesh.household.dto.HouseholdMemberResponse;
import com.mdstech.wealthmesh.household.service.HouseholdMemberService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/household-members")
public class HouseholdMemberController {

    private final HouseholdMemberService service;

    public HouseholdMemberController(HouseholdMemberService service) {
        this.service = service;
    }

    @GetMapping
    public Flux<HouseholdMemberResponse> list(@RequestParam(required = false) UUID householdId) {
        return service.findAll(householdId);
    }

    @GetMapping("/{id}")
    public Mono<HouseholdMemberResponse> get(@PathVariable UUID id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<HouseholdMemberResponse> create(@RequestBody HouseholdMemberRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public Mono<HouseholdMemberResponse> update(@PathVariable UUID id, @RequestBody HouseholdMemberRequest request) {
        return service.update(id, request);
    }

    @PostMapping("/{id}/deactivate")
    public Mono<HouseholdMemberResponse> deactivate(@PathVariable UUID id) {
        return service.deactivate(id);
    }

    @PostMapping("/{id}/restore")
    public Mono<HouseholdMemberResponse> restore(@PathVariable UUID id) {
        return service.restore(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> delete(@PathVariable UUID id) {
        return service.delete(id);
    }
}
