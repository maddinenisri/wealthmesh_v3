package com.mdstech.wealthmesh.household;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.household.dto.HouseholdRequest;
import com.mdstech.wealthmesh.household.dto.HouseholdResponse;
import com.mdstech.wealthmesh.household.service.HouseholdService;

import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/household")
public class HouseholdController {

    private final HouseholdService service;

    public HouseholdController(HouseholdService service) {
        this.service = service;
    }

    @GetMapping
    public Mono<HouseholdResponse> get() {
        return service.get();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<HouseholdResponse> create(@RequestBody HouseholdRequest request) {
        return service.create(request);
    }

    @PutMapping
    public Mono<HouseholdResponse> rename(@RequestBody HouseholdRequest request) {
        return service.rename(request);
    }
}
