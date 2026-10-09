package com.mdstech.wealthmesh.wealth;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.wealth.dto.WealthChange;
import com.mdstech.wealthmesh.wealth.dto.WealthSummary;
import com.mdstech.wealthmesh.wealth.service.WealthService;

import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/wealth")
public class WealthController {

    private final WealthService service;

    public WealthController(WealthService service) {
        this.service = service;
    }

    /** Wealth as of a date (today when `asOf` is left out), for the whole household or one member's accounts. */
    @GetMapping
    public Mono<WealthSummary> summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
            @RequestParam(required = false) java.util.UUID memberId) {
        return service.summary(asOf, memberId);
    }

    /** What explains the change in wealth from one date to another. */
    @GetMapping("/change")
    public Mono<WealthChange> change(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.change(from, to);
    }
}
