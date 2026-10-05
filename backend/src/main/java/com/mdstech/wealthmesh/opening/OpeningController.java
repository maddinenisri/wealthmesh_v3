package com.mdstech.wealthmesh.opening;

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

import com.mdstech.wealthmesh.opening.dto.OpeningPreview;
import com.mdstech.wealthmesh.opening.dto.OpeningRequest;
import com.mdstech.wealthmesh.opening.dto.OpeningRevisionResponse;
import com.mdstech.wealthmesh.opening.service.OpeningRevisionService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Corrections of the starting balance and tracking start, with a read-only preview. */
@RestController
@RequestMapping("/api/v1/accounts/{accountId}/starting-balance-corrections")
public class OpeningController {

    private final OpeningRevisionService service;

    public OpeningController(OpeningRevisionService service) {
        this.service = service;
    }

    @GetMapping
    public Flux<OpeningRevisionResponse> all(@PathVariable UUID accountId) {
        return service.ofAccount(accountId);
    }

    @GetMapping("/preview")
    public Mono<OpeningPreview> preview(@PathVariable UUID accountId, @RequestParam String openingAmount,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate openedOn,
            @RequestParam(required = false) String entryKind, @RequestParam(required = false) String entryAmount,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate entryOn) {
        OpeningRevisionService.PendingEntry entry = entryKind == null && entryAmount == null && entryOn == null
                ? null : new OpeningRevisionService.PendingEntry(entryKind, entryAmount, entryOn);
        return service.preview(accountId, openingAmount, openedOn, entry);
    }

    /** 201 when created, 200 for a repeated save key (D-024). */
    @PostMapping
    public Mono<ResponseEntity<OpeningRevisionResponse>> save(@PathVariable UUID accountId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody OpeningRequest request) {
        return service.save(accountId, key, request).map(saved -> ResponseEntity
                .status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.revision()));
    }
}
