package com.mdstech.wealthmesh.budget;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.budget.dto.BudgetCopyRequest;
import com.mdstech.wealthmesh.budget.dto.BudgetMonth;
import com.mdstech.wealthmesh.budget.dto.BudgetRequest;
import com.mdstech.wealthmesh.budget.dto.BudgetView;
import com.mdstech.wealthmesh.budget.dto.BudgetWho;
import com.mdstech.wealthmesh.budget.service.BudgetService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Monthly Budgets (slice 13). Months are like 2026-09; every write names who entered it (D-025). */
@RestController
@RequestMapping("/api/v1/budgets")
public class BudgetController {

    private final BudgetService service;

    public BudgetController(BudgetService service) {
        this.service = service;
    }

    @GetMapping
    public Flux<BudgetMonth> months() {
        return service.months();
    }

    @GetMapping("/{month}")
    public Mono<BudgetView> view(@PathVariable String month) {
        return service.view(month);
    }

    /** 201 when the save was applied, 200 when its key was already used by an identical request (D-024). */
    @PutMapping("/{month}")
    public Mono<ResponseEntity<BudgetView>> save(@PathVariable String month,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody BudgetRequest request) {
        return service.save(month, key, request).map(BudgetController::saved);
    }

    /** The review before Confirm: the month as it would be saved. Writes nothing. */
    @PostMapping("/{month}/review")
    public Mono<BudgetView> review(@PathVariable String month, @RequestBody BudgetRequest request) {
        return service.review(month, request);
    }

    @PostMapping("/{month}/copy")
    public Mono<ResponseEntity<BudgetView>> copy(@PathVariable String month,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody BudgetCopyRequest request) {
        return service.copy(month, key, request).map(BudgetController::saved);
    }

    @PostMapping("/{month}/remove")
    public Mono<BudgetView> remove(@PathVariable String month, @RequestBody(required = false) BudgetWho who) {
        return service.remove(month, memberOf(who));
    }

    @PostMapping("/{month}/undo")
    public Mono<BudgetView> undo(@PathVariable String month, @RequestBody(required = false) BudgetWho who) {
        return service.undo(month, memberOf(who));
    }

    private static ResponseEntity<BudgetView> saved(BudgetService.Saved saved) {
        return ResponseEntity.status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.view());
    }

    private static java.util.UUID memberOf(BudgetWho who) {
        if (who == null || who.enteredByMemberId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose who entered this");
        }
        return who.enteredByMemberId();
    }
}
