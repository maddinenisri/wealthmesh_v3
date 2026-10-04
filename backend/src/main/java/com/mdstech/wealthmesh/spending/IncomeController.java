package com.mdstech.wealthmesh.spending;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.activity.dto.ActivityResponse;
import com.mdstech.wealthmesh.spending.dto.MonthReview;
import com.mdstech.wealthmesh.spending.dto.SpendingSummary;
import com.mdstech.wealthmesh.spending.service.SpendingService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Income by month and category, and the month review that sets it beside spending. */
@RestController
@RequestMapping("/api/v1")
public class IncomeController {

    private final SpendingService service;

    public IncomeController(SpendingService service) {
        this.service = service;
    }

    @GetMapping("/income")
    public Mono<SpendingSummary> income(@RequestParam(required = false) String month) {
        return service.incomeSummary(month);
    }

    @GetMapping("/income/entries")
    public Flux<ActivityResponse> entries(@RequestParam(required = false) String month,
            @RequestParam(required = false) UUID categoryId) {
        return service.incomeEntries(month, categoryId);
    }

    @GetMapping("/review")
    public Mono<MonthReview> review(@RequestParam(required = false) String month) {
        return service.review(month);
    }
}
