package com.mdstech.wealthmesh.activity.repository;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.activity.domain.Portion;
import com.mdstech.wealthmesh.activity.dto.PortionResponse;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Mono;

/** SQL for the portions of split payments (`activity_portion`). Portions are written once with their payment. */
@Repository
public class PortionStore {

    private final DatabaseClient client;

    public PortionStore(DatabaseClient client) {
        this.client = client;
    }

    /** Writes the portions of a new payment in order; call it in the transaction that saves the payment. */
    public Mono<Void> insert(UUID activityId, List<Portion> portions) {
        return reactor.core.publisher.Flux.range(0, portions.size()).concatMap(i -> {
            Portion p = portions.get(i);
            DatabaseClient.GenericExecuteSpec spec = client.sql("INSERT INTO activity_portion "
                            + "(activity_id, seq, category_id, classification, amount) "
                            + "VALUES (:activity, :seq, :category, " + (p.classification() == null ? "NULL" : ":class")
                            + ", :amount)")
                    .bind("activity", activityId).bind("seq", i + 1).bind("category", p.categoryId())
                    .bind("amount", p.amount());
            if (p.classification() != null) {
                spec = spec.bind("class", p.classification());
            }
            return spec.fetch().rowsUpdated();
        }).then();
    }

    /**
     * Writes the portions of a loan payment on its paying row: the principal, and the interest (when there is any) as
     * a category portion under the loan's interest category, with that category's default class (D-042).
     */
    public Mono<Void> insertLoan(UUID activityId, BigDecimal principal, BigDecimal interest, UUID interestCategory) {
        Mono<Long> principalRow = client.sql("INSERT INTO activity_portion (activity_id, seq, kind, amount) "
                        + "VALUES (:activity, 1, 'principal', :amount)")
                .bind("activity", activityId).bind("amount", principal).fetch().rowsUpdated();
        if (interest.signum() == 0) {
            return principalRow.then();
        }
        return principalRow.then(client.sql("INSERT INTO activity_portion "
                        + "(activity_id, seq, kind, category_id, classification, amount) "
                        + "SELECT :activity, 2, 'category', c.id, c.default_class, :amount FROM category c "
                        + "WHERE c.id = :category")
                .bind("activity", activityId).bind("amount", interest).bind("category", interestCategory)
                .fetch().rowsUpdated()).then();
    }

    /** The stored portions of one payment, in the order they were entered; empty for a payment that is not split. */
    public Mono<List<Portion>> of(UUID activityId) {
        return client.sql("SELECT category_id, classification, amount FROM activity_portion "
                        + "WHERE activity_id = :id AND kind = 'category' ORDER BY seq")
                .bind("id", activityId)
                .map((row, meta) -> new Portion(row.get("category_id", UUID.class),
                        row.get("classification", String.class), row.get("amount", BigDecimal.class)))
                .all().collectList();
    }

    /** True when the payment has portions. */
    public Mono<Boolean> isSplit(UUID activityId) {
        return client.sql("SELECT EXISTS (SELECT 1 FROM activity_portion WHERE activity_id = :id) AS split")
                .bind("id", activityId).map((row, meta) -> row.get("split", Boolean.class)).one();
    }

    /** The portions of several payments as they are shown, each under the category it counts under now. */
    public Mono<Map<UUID, List<PortionResponse>>> shownFor(Collection<UUID> activityIds) {
        if (activityIds.isEmpty()) {
            return Mono.just(Map.of());
        }
        return client.sql("""
                SELECT p.activity_id, c.id AS category_id, c.name, (c.archived_at IS NOT NULL) AS archived,
                       p.classification, p.amount
                FROM activity_portion p JOIN category oc ON oc.id = p.category_id
                JOIN category c ON c.id = COALESCE(oc.merged_into_id, oc.id)
                WHERE p.activity_id IN (:ids) AND p.kind = 'category' ORDER BY p.activity_id, p.seq""")
                .bind("ids", List.copyOf(activityIds))
                .map((row, meta) -> Map.entry(row.get("activity_id", UUID.class),
                        new PortionResponse(row.get("category_id", UUID.class), row.get("name", String.class),
                                Boolean.TRUE.equals(row.get("archived", Boolean.class)),
                                row.get("classification", String.class),
                                Money.format(row.get("amount", BigDecimal.class)))))
                .all().collect(Collectors.groupingBy(Map.Entry::getKey,
                        Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
    }
}
