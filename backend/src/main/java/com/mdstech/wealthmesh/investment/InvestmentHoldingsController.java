package com.mdstech.wealthmesh.investment;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.investment.dto.InvestmentHoldings;
import com.mdstech.wealthmesh.investment.service.InvestmentHoldingsService;

import reactor.core.publisher.Mono;

/** The holdings of the whole investment group (slice 19c, V2_HOLDINGS_002). */
@RestController
@RequestMapping("/api/v1/investments")
public class InvestmentHoldingsController {

    private final InvestmentHoldingsService service;

    public InvestmentHoldingsController(InvestmentHoldingsService service) {
        this.service = service;
    }

    @GetMapping("/holdings")
    public Mono<InvestmentHoldings> holdings() {
        return service.view();
    }
}
