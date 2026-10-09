package com.mdstech.wealthmesh.investment;

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

import com.mdstech.wealthmesh.investment.dto.PriceHistory;
import com.mdstech.wealthmesh.investment.dto.PriceRequest;
import com.mdstech.wealthmesh.investment.dto.PriceResult;
import com.mdstech.wealthmesh.investment.dto.PriceReview;
import com.mdstech.wealthmesh.investment.service.HoldingPriceService;

import reactor.core.publisher.Mono;

/** Prices recorded on the holdings of an investment account (slice 19b). */
@RestController
@RequestMapping("/api/v1/accounts/{accountId}/prices")
public class HoldingPriceController {

    private final HoldingPriceService service;

    public HoldingPriceController(HoldingPriceService service) {
        this.service = service;
    }

    @GetMapping
    public Mono<PriceHistory> history(@PathVariable UUID accountId) {
        return service.history(accountId);
    }

    /** The review before a price is saved: the same checks as the save, writing nothing. */
    @PostMapping("/review")
    public Mono<PriceReview> review(@PathVariable UUID accountId, @RequestBody PriceRequest request) {
        return service.review(accountId, request);
    }

    /** 201 when created, 200 when the save key was already used by an identical request (D-024). */
    @PostMapping
    public Mono<ResponseEntity<PriceResult>> save(@PathVariable UUID accountId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody PriceRequest request) {
        return service.save(accountId, key, request).map(saved -> ResponseEntity
                .status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.result()));
    }
}
