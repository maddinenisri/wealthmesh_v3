package com.mdstech.wealthmesh.activity;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Qualifier;
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
import com.mdstech.wealthmesh.activity.dto.Transfer;
import com.mdstech.wealthmesh.activity.dto.TransferPreview;
import com.mdstech.wealthmesh.activity.dto.TransferRequest;
import com.mdstech.wealthmesh.activity.service.MovementService;
import com.mdstech.wealthmesh.activity.service.MovementService.MovementKind;
import com.mdstech.wealthmesh.activity.service.TransferPreviewService;

import reactor.core.publisher.Mono;

/**
 * A payment from a checking or savings account to a loan: one request changes both sides. `from` is the paying
 * account, `to` the loan; `amount` leaves the paying account, `principal` reduces the debt and `interest` is spending.
 * 201 when created, 200 for a replay. Same mechanism as transfers and card payments (D-036, D-054).
 */
@RestController
@RequestMapping("/api/v1/loan-payments")
public class LoanPaymentController {

    private final MovementService service;
    private final TransferPreviewService previews;

    public LoanPaymentController(@Qualifier("loanPayments") MovementService service,
            TransferPreviewService previews) {
        this.service = service;
        this.previews = previews;
    }

    @PostMapping
    public Mono<ResponseEntity<Transfer>> create(@RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody TransferRequest request) {
        return service.create(key, request).map(LoanPaymentController::respond);
    }

    @GetMapping("/{movementId}")
    public Mono<Transfer> get(@PathVariable UUID movementId) {
        return service.get(movementId);
    }

    /** The Balances after a new payment, or after the correction of {@code movementId}. */
    @GetMapping("/preview")
    public Mono<TransferPreview> preview(@RequestParam(required = false) UUID fromAccountId,
            @RequestParam(required = false) UUID toAccountId, @RequestParam(required = false) String amount,
            @RequestParam(required = false) String principal, @RequestParam(required = false) String interest,
            @RequestParam(required = false) LocalDate occurredOn, @RequestParam(required = false) UUID movementId) {
        return previews.preview(MovementKind.LOAN_PAYMENT, fromAccountId, toAccountId, amount, principal, interest,
                occurredOn, movementId, null);
    }

    @PostMapping("/{movementId}/replacement")
    public Mono<ResponseEntity<Transfer>> replace(@PathVariable UUID movementId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody TransferRequest request) {
        return service.replace(movementId, key, request).map(LoanPaymentController::respond);
    }

    @PostMapping("/{movementId}/removal")
    public Mono<Transfer> remove(@PathVariable UUID movementId, @RequestBody ChangeRequest request) {
        return service.remove(movementId, request.enteredByMemberId());
    }

    @PostMapping("/{movementId}/undo")
    public Mono<Transfer> undo(@PathVariable UUID movementId, @RequestBody ChangeRequest request) {
        return service.undo(movementId, request.enteredByMemberId());
    }

    private static ResponseEntity<Transfer> respond(MovementService.Saved saved) {
        return ResponseEntity.status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.transfer());
    }
}
