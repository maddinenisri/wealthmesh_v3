package com.mdstech.wealthmesh.activity;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.activity.dto.ChangeRequest;
import com.mdstech.wealthmesh.activity.dto.ConversionRequest;
import com.mdstech.wealthmesh.activity.dto.Transfer;
import com.mdstech.wealthmesh.activity.dto.TransferPreview;
import com.mdstech.wealthmesh.activity.dto.TransferRequest;
import com.mdstech.wealthmesh.activity.service.MovementService;
import com.mdstech.wealthmesh.activity.service.TransferPreviewService;

import reactor.core.publisher.Mono;

/**
 * Transfers between two accounts: one request changes both sides (foundations 7). 201 when created, 200 for a
 * replay.
 */
@RestController
@RequestMapping("/api/v1")
public class TransferController {

    private final MovementService service;
    private final TransferPreviewService previews;

    public TransferController(MovementService service, TransferPreviewService previews) {
        this.service = service;
        this.previews = previews;
    }

    @PostMapping("/transfers")
    public Mono<ResponseEntity<Transfer>> create(@RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody TransferRequest request) {
        return service.create(key, request).map(TransferController::respond);
    }

    @GetMapping("/transfers/{movementId}")
    public Mono<Transfer> get(@PathVariable UUID movementId) {
        return service.get(movementId);
    }

    /** The Balances after a new transfer, a correction of {@code movementId}, or the change of {@code activityId}. */
    @GetMapping("/transfers/preview")
    public Mono<TransferPreview> preview(@RequestParam(required = false) UUID fromAccountId,
            @RequestParam(required = false) UUID toAccountId, @RequestParam(required = false) String amount,
            @RequestParam(required = false) LocalDate occurredOn, @RequestParam(required = false) UUID movementId,
            @RequestParam(required = false) UUID activityId) {
        return previews.preview(fromAccountId, toAccountId, amount, occurredOn, movementId, activityId);
    }

    @PostMapping("/transfers/{movementId}/replacement")
    public Mono<ResponseEntity<Transfer>> replace(@PathVariable UUID movementId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody TransferRequest request) {
        return service.replace(movementId, key, request).map(TransferController::respond);
    }

    @PostMapping("/transfers/{movementId}/removal")
    public Mono<Transfer> remove(@PathVariable UUID movementId, @RequestBody ChangeRequest request) {
        return service.remove(movementId, request.enteredByMemberId());
    }

    @PostMapping("/transfers/{movementId}/undo")
    public Mono<Transfer> undo(@PathVariable UUID movementId, @RequestBody ChangeRequest request) {
        return service.undo(movementId, request.enteredByMemberId());
    }

    /** An expense that was really a transfer (V2_EXPENSE_008). */
    @PostMapping("/accounts/{accountId}/activity/{activityId}/transfer")
    public Mono<ResponseEntity<Transfer>> convert(@PathVariable UUID accountId, @PathVariable UUID activityId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody ConversionRequest request) {
        return service.convert(accountId, activityId, key, request).map(TransferController::respond);
    }

    private static ResponseEntity<Transfer> respond(MovementService.Saved saved) {
        return ResponseEntity.status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.transfer());
    }
}
