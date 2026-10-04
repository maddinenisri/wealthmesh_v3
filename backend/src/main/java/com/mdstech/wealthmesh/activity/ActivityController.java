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
import com.mdstech.wealthmesh.activity.dto.ChangeRequest;
import com.mdstech.wealthmesh.activity.dto.ExpenseRequest;
import com.mdstech.wealthmesh.activity.dto.HistoryEntry;
import com.mdstech.wealthmesh.activity.dto.ReplacementRequest;
import com.mdstech.wealthmesh.activity.service.EntryChangeService;
import com.mdstech.wealthmesh.activity.service.EntryService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/accounts/{accountId}")
public class ActivityController {

    private final EntryService service;
    private final EntryChangeService changes;

    public ActivityController(EntryService service, EntryChangeService changes) {
        this.service = service;
        this.changes = changes;
    }

    @GetMapping("/activity/history")
    public Flux<HistoryEntry> history(@PathVariable UUID accountId) {
        return changes.history(accountId);
    }

    /** Edit as replacement: 201 when created, 200 for a repeated save key (D-024). */
    @PostMapping("/activity/{activityId}/replacement")
    public Mono<ResponseEntity<ActivityResponse>> replace(@PathVariable UUID accountId,
            @PathVariable UUID activityId, @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody ReplacementRequest request) {
        return changes.replace(accountId, activityId, key, request).map(saved -> ResponseEntity
                .status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.activity()));
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
        return save(accountId, key, "expense", request);
    }

    @PostMapping("/income")
    public Mono<ResponseEntity<ActivityResponse>> recordIncome(@PathVariable UUID accountId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody ExpenseRequest request) {
        return save(accountId, key, "income", request);
    }

    @PostMapping("/activity/{activityId}/removal")
    public Mono<HistoryEntry> remove(@PathVariable UUID accountId, @PathVariable UUID activityId,
            @RequestBody ChangeRequest request) {
        return changes.remove(accountId, activityId, request.enteredByMemberId());
    }

    @PostMapping("/activity/{activityId}/undo")
    public Mono<HistoryEntry> undo(@PathVariable UUID accountId, @PathVariable UUID activityId,
            @RequestBody ChangeRequest request) {
        return changes.undo(accountId, activityId, request.enteredByMemberId());
    }

    private Mono<ResponseEntity<ActivityResponse>> save(UUID accountId, String key, String kind,
            ExpenseRequest request) {
        return service.record(accountId, key, kind, request).map(saved -> ResponseEntity
                .status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.activity()));
    }
}
