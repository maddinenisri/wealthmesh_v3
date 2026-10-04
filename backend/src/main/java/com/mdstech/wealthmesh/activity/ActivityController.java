package com.mdstech.wealthmesh.activity;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.activity.dto.ActivityResponse;
import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.activity.service.ExpenseService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/accounts/{accountId}")
public class ActivityController {

    private final ExpenseService service;

    public ActivityController(ExpenseService service) {
        this.service = service;
    }

    @GetMapping("/activity")
    public Flux<ActivityResponse> activity(@PathVariable UUID accountId) {
        return service.activityOf(accountId);
    }

    /** 201 when created, 200 when the save key was already used by an identical request (D-024). */
    @PostMapping("/expenses")
    public Mono<ResponseEntity<ActivityResponse>> record(@PathVariable UUID accountId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody ExpenseRequest request) {
        return service.record(accountId, key, request).map(saved -> ResponseEntity
                .status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.activity()));
    }
}
