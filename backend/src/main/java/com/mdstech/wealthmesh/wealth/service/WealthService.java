package com.mdstech.wealthmesh.wealth.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.wealth.dto.WealthSummary;
import com.mdstech.wealthmesh.wealth.dto.WealthSummary.Group;
import com.mdstech.wealthmesh.wealth.dto.WealthSummary.Line;

import reactor.core.publisher.Mono;

/**
 * Wealth (W1, W2): a positive Balance is a financial asset, a negative one (an overdraft or card debt) is a debt,
 * counted once (D-022). Bank money and cards are shown as groups with their own signed Balances. Drafts and deleted
 * accounts never count (foundations 5); archived and closed accounts do, because hiding an account never makes its
 * money or debt disappear (D-046).
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
                .map(account -> line(account, deltas))
                .collectList()
                .map(WealthService::summarize));
    }

    private static Line line(Account account, Map<UUID, ActivityStore.Delta> deltas) {
        BigDecimal balance = account.openingAmount()
                .add(deltas.getOrDefault(account.id(), ActivityStore.Delta.NONE).amount());
        return new Line(account.id().toString(), account.name(), account.type(), account.status(),
                Money.format(balance));
    }

    private static WealthSummary summarize(List<Line> lines) {
        List<Line> bank = lines.stream().filter(l -> !AccountType.isCard(l.type())).toList();
        List<Line> cards = lines.stream().filter(l -> AccountType.isCard(l.type())).toList();
        BigDecimal assets = lines.stream().map(WealthService::amount).filter(b -> b.signum() > 0)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        List<Line> debtLines = lines.stream().filter(l -> amount(l).signum() < 0).toList();
        BigDecimal debts = debtLines.stream().map(l -> amount(l).negate()).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new WealthSummary(Money.format(assets), Money.format(debts), Money.format(assets.subtract(debts)),
                group(bank), group(cards), debtLines);
    }

    private static Group group(List<Line> lines) {
        return new Group(Money.format(lines.stream().map(WealthService::amount).reduce(BigDecimal.ZERO,
                BigDecimal::add)), lines);
    }

    private static BigDecimal amount(Line line) {
        return new BigDecimal(line.balance());
    }
}
