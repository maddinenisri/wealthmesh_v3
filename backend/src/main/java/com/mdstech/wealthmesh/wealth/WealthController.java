package com.mdstech.wealthmesh.wealth;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

    @GetMapping
    public Mono<WealthSummary> summary() {
        return service.summary();
    }
}
