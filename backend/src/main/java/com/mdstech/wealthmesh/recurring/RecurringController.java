package com.mdstech.wealthmesh.recurring;

import java.util.UUID;

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

import com.mdstech.wealthmesh.recurring.dto.DismissSuggestionRequest;
import com.mdstech.wealthmesh.recurring.dto.RecordRequest;
import com.mdstech.wealthmesh.recurring.dto.RecordReview;
import com.mdstech.wealthmesh.recurring.dto.RecurringOverview;
import com.mdstech.wealthmesh.recurring.dto.RecurringWho;
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

    @GetMapping("/{id}")
    public Mono<ScheduleView> view(@PathVariable UUID id) {
        return service.view(id);
    }

    /** Changes the amount, frequency and next due date; 201 when applied, 200 on a replay (D-024). */
    @PutMapping("/{id}")
    public Mono<ResponseEntity<ScheduleView>> change(@PathVariable UUID id,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody ScheduleRequest request) {
        return service.change(id, key, request).map(RecurringController::saved);
    }

    /** What recording the actual expense would do, before Confirm. Writes nothing. */
    @PostMapping("/{id}/record/review")
    public Mono<RecordReview> reviewRecord(@PathVariable UUID id, @RequestBody RecordRequest request) {
        return service.reviewRecord(id, request);
    }

    /** Records the actual expense of the next occurrence: 201 when saved, 200 on a replay of the key (D-024). */
    @PostMapping("/{id}/record")
    public Mono<ResponseEntity<ScheduleView>> record(@PathVariable UUID id,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody RecordRequest request) {
        return service.record(id, key, request).map(RecurringController::saved);
    }

    /** Moves the next occurrence to the due date in the body; no expense is recorded. */
    @PostMapping("/{id}/reschedule")
    public Mono<ScheduleView> reschedule(@PathVariable UUID id, @RequestBody(required = false) RecurringWho who) {
        return service.reschedule(id, memberOf(who), who.dueOn());
    }

    /** Dismisses the occurrence due on the date in the body; no expense is recorded. */
    @PostMapping("/{id}/dismiss")
    public Mono<ScheduleView> dismissOccurrence(@PathVariable UUID id,
            @RequestBody(required = false) RecurringWho who) {
        return service.dismissOccurrence(id, memberOf(who), who.dueOn());
    }

    @PostMapping("/{id}/pause")
    public Mono<ScheduleView> pause(@PathVariable UUID id, @RequestBody(required = false) RecurringWho who) {
        return service.pause(id, memberOf(who));
    }

    @PostMapping("/{id}/resume")
    public Mono<ScheduleView> resume(@PathVariable UUID id, @RequestBody(required = false) RecurringWho who) {
        return service.resume(id, memberOf(who), who.dueOn());
    }

    @PostMapping("/{id}/delete")
    public Mono<ScheduleView> delete(@PathVariable UUID id, @RequestBody(required = false) RecurringWho who) {
        return service.delete(id, memberOf(who));
    }

    private static UUID memberOf(RecurringWho who) {
        if (who == null || who.enteredByMemberId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose who entered this");
        }
        return who.enteredByMemberId();
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
