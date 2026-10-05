package com.mdstech.wealthmesh.activity;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
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

import com.mdstech.wealthmesh.activity.dto.ActivityResponse;
import com.mdstech.wealthmesh.activity.dto.BalanceView;
import com.mdstech.wealthmesh.activity.dto.CorrectionPreview;
import com.mdstech.wealthmesh.activity.dto.CorrectionRequest;
import com.mdstech.wealthmesh.activity.service.BalanceCorrectionService;

import reactor.core.publisher.Mono;

/** Balance as of a date, and dated Balance corrections with a read-only preview. */
@RestController
@RequestMapping("/api/v1/accounts/{accountId}")
public class BalanceController {

    private final BalanceCorrectionService service;

    public BalanceController(BalanceCorrectionService service) {
        this.service = service;
    }

    @GetMapping("/balance")
    public Mono<BalanceView> balance(@PathVariable UUID accountId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        return service.balanceAsOf(accountId, asOf);
    }

    @GetMapping("/balance-corrections/preview")
    public Mono<CorrectionPreview> preview(@PathVariable UUID accountId, @RequestParam String requested,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOn,
            @RequestParam(required = false) UUID replaces, @RequestParam(required = false) String side) {
        return service.preview(accountId, requested, side, asOn, replaces);
    }

    /** 201 when created, 200 for a repeated save key (D-024). */
    @PostMapping("/balance-corrections")
    public Mono<ResponseEntity<ActivityResponse>> correct(@PathVariable UUID accountId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody CorrectionRequest request) {
        return service.save(accountId, key, request).map(saved -> ResponseEntity
                .status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.activity()));
    }
}
