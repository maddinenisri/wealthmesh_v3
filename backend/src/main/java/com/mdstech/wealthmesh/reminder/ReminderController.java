package com.mdstech.wealthmesh.reminder;

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

import com.mdstech.wealthmesh.reminder.dto.ReminderRequest;
import com.mdstech.wealthmesh.reminder.dto.ReminderResponse;
import com.mdstech.wealthmesh.reminder.service.ReminderService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1")
public class ReminderController {

    private final ReminderService service;

    public ReminderController(ReminderService service) {
        this.service = service;
    }

    @GetMapping("/reminders")
    public Flux<ReminderResponse> all() {
        return service.all();
    }

    /** 201 when created, 200 when the save key was already used by an identical request (D-024). */
    @PostMapping("/accounts/{accountId}/reminders")
    public Mono<ResponseEntity<ReminderResponse>> save(@PathVariable UUID accountId,
            @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody ReminderRequest request) {
        return service.save(accountId, key, request).map(saved -> ResponseEntity
                .status(saved.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved.reminder()));
    }
}
