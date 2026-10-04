package com.mdstech.wealthmesh.wealth.service;

import java.math.BigDecimal;

import org.springframework.stereotype.Service;

import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.wealth.dto.WealthSummary;

import reactor.core.publisher.Mono;

/**
 * Basic wealth (W1): a positive bank Balance is a financial asset, a negative one (an overdraft) is a debt, counted
 * once (D-022). Drafts never count (foundations 5). Each account keeps its own signed Balance.
 */
@Service
public class WealthService {

    private final AccountRepository accounts;
    private final ActivityStore store;

    public WealthService(AccountRepository accounts, ActivityStore store) {
        this.accounts = accounts;
        this.store = store;
    }

    public Mono<WealthSummary> summary() {
        return store.deltasByAccount().flatMap(deltas -> accounts.findAllByOrderByNameAscCreatedAtAsc()
                .filter(account -> !"draft".equals(account.status()))
                .map(account -> account.openingAmount()
                        .add(deltas.getOrDefault(account.id(), ActivityStore.Delta.NONE).amount()))
                .collectList()
                .map(balances -> new WealthSummary(
                        Money.format(balances.stream().filter(b -> b.signum() > 0).reduce(BigDecimal.ZERO,
                                BigDecimal::add)),
                        Money.format(balances.stream().filter(b -> b.signum() < 0).map(BigDecimal::negate)
                                .reduce(BigDecimal.ZERO, BigDecimal::add)))));
    }
}
