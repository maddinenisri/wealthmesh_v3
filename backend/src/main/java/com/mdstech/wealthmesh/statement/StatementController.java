package com.mdstech.wealthmesh.statement;

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

import com.mdstech.wealthmesh.statement.dto.StatementRequest;
import com.mdstech.wealthmesh.statement.dto.StatementResponse;
import com.mdstech.wealthmesh.statement.service.StatementService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/accounts/{accountId}/statements")
public class StatementController {

    private final StatementService service;

    public StatementController(StatementService service) {
        this.service = service;
    }

    @GetMapping
    public Flux<StatementResponse> all(@PathVariable UUID accountId) {
        return service.ofAccount(accountId);
    }

    /** 201 when created, 200 when the save key was already used by an identical request (D-024). */
    @PostMapping
    public Mono<ResponseEntity<StatementResponse>> attach(@PathVariable UUID accountId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody StatementRequest request) {
        return service.attach(accountId, key, request).map(StatementController::response);
    }

    @PostMapping("/{statementId}/revision")
    public Mono<ResponseEntity<StatementResponse>> revise(@PathVariable UUID accountId,
            @PathVariable UUID statementId, @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody StatementRequest request) {
        return service.revise(accountId, statementId, key, request).map(StatementController::response);
    }

    private static ResponseEntity<StatementResponse> response(StatementService.Saved saved) {
        return ResponseEntity.status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(saved.statement());
    }
}
