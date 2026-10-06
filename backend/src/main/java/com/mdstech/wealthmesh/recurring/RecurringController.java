package com.mdstech.wealthmesh.recurring;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.recurring.dto.DismissSuggestionRequest;
import com.mdstech.wealthmesh.recurring.dto.RecurringOverview;
import com.mdstech.wealthmesh.recurring.dto.ScheduleRequest;
import com.mdstech.wealthmesh.recurring.dto.ScheduleView;
import com.mdstech.wealthmesh.recurring.service.RecurringService;

import reactor.core.publisher.Mono;

/** Recurring bills (slice 14): schedules and expected amounts. Every write names who entered it (D-025). */
@RestController
@RequestMapping("/api/v1/recurring")
public class RecurringController {

    private final RecurringService service;

    public RecurringController(RecurringService service) {
        this.service = service;
    }

    @GetMapping
    public Mono<RecurringOverview> overview() {
        return service.overview();
    }

    /** Dismisses a suggestion without touching any bill; the same request again returns the same list. */
    @PostMapping("/suggestions/dismiss")
    public Mono<RecurringOverview> dismiss(@RequestBody DismissSuggestionRequest request) {
        return service.dismissSuggestion(request);
    }

    /** The review before Confirm: the schedule as it would be saved. Writes nothing. */
    @PostMapping("/review")
    public Mono<ScheduleView> review(@RequestBody ScheduleRequest request) {
        return service.review(request);
    }

    /** 201 when saved, 200 when the key was already used by an identical request (D-024). */
    @PostMapping
    public Mono<ResponseEntity<ScheduleView>> create(
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody ScheduleRequest request) {
        return service.create(key, request).map(RecurringController::saved);
    }

    private static ResponseEntity<ScheduleView> saved(RecurringService.Saved saved) {
        return ResponseEntity.status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.view());
    }
}
