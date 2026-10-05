package com.mdstech.wealthmesh.spending;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.activity.dto.ActivityResponse;
import com.mdstech.wealthmesh.spending.dto.SpendingHistory;
import com.mdstech.wealthmesh.spending.dto.SpendingSummary;
import com.mdstech.wealthmesh.spending.service.SpendingService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/spending")
public class SpendingController {

    private final SpendingService service;

    public SpendingController(SpendingService service) {
        this.service = service;
    }

    @GetMapping
    public Mono<SpendingSummary> summary(@RequestParam(required = false) String month,
            @RequestParam(required = false) UUID accountId) {
        return service.summary(month, accountId);
    }

    @GetMapping("/entries")
    public Flux<ActivityResponse> entries(@RequestParam(required = false) String month,
            @RequestParam(required = false) UUID categoryId, @RequestParam(required = false) UUID accountId,
            @RequestParam(defaultValue = "false") boolean uncategorized) {
        return uncategorized ? service.uncategorizedEntries(month, accountId)
                : service.entries(month, categoryId, accountId);
    }

    @GetMapping("/history")
    public Mono<SpendingHistory> history() {
        return service.history();
    }
}
