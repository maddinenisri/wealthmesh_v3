package com.mdstech.wealthmesh.value;

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

import com.mdstech.wealthmesh.value.dto.ValueHistory;
import com.mdstech.wealthmesh.value.dto.ValueRequest;
import com.mdstech.wealthmesh.value.dto.ValueResult;
import com.mdstech.wealthmesh.value.dto.ValueReview;
import com.mdstech.wealthmesh.value.service.ValueService;
import com.mdstech.wealthmesh.value.service.ValueService.ValueWho;

import reactor.core.publisher.Mono;

/** Dated values of a property or other asset: history, review, save, correct, remove and Undo. */
@RestController
@RequestMapping("/api/v1/accounts/{accountId}/values")
public class ValueController {

    private final ValueService service;

    public ValueController(ValueService service) {
        this.service = service;
    }

    @GetMapping
    public Mono<ValueHistory> history(@PathVariable UUID accountId) {
        return service.history(accountId);
    }

    @PostMapping("/review")
    public Mono<ValueReview> review(@PathVariable UUID accountId, @RequestBody ValueRequest request) {
        return service.review(accountId, null, request);
    }

    @PostMapping("/{valueId}/correction/review")
    public Mono<ValueReview> reviewCorrection(@PathVariable UUID accountId, @PathVariable UUID valueId,
            @RequestBody ValueRequest request) {
        return service.review(accountId, valueId, request);
    }

    /** 201 when created, 200 for a repeated save key (D-024). */
    @PostMapping
    public Mono<ResponseEntity<ValueResult>> save(@PathVariable UUID accountId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody ValueRequest request) {
        return service.save(accountId, key, request).map(ValueController::answer);
    }

    @PostMapping("/{valueId}/correction")
    public Mono<ResponseEntity<ValueResult>> correct(@PathVariable UUID accountId, @PathVariable UUID valueId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody ValueRequest request) {
        return service.correct(accountId, valueId, key, request).map(ValueController::answer);
    }

    @GetMapping("/{valueId}/removal/review")
    public Mono<ValueResult> reviewRemoval(@PathVariable UUID accountId, @PathVariable UUID valueId) {
        return service.reviewRemoval(accountId, valueId);
    }

    @PostMapping("/{valueId}/removal")
    public Mono<ValueResult> remove(@PathVariable UUID accountId, @PathVariable UUID valueId,
            @RequestBody ValueWho who) {
        return service.remove(accountId, valueId, who);
    }

    @PostMapping("/{valueId}/undo")
    public Mono<ValueResult> undo(@PathVariable UUID accountId, @PathVariable UUID valueId,
            @RequestBody ValueWho who) {
        return service.undo(accountId, valueId, who);
    }

    private static ResponseEntity<ValueResult> answer(ValueService.Saved saved) {
        return ResponseEntity.status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.result());
    }
}
