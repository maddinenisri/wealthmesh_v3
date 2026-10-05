package com.mdstech.wealthmesh.household.repository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import com.mdstech.wealthmesh.household.dto.HouseholdMemberResponse.NameChange;

import reactor.core.publisher.Mono;

/** Profile change history of members (V2_MEMBERS_005): written with plain SQL, newest change first. */
@Repository
public class MemberNameHistoryStore {

    private final DatabaseClient client;

    public MemberNameHistoryStore(DatabaseClient client) {
        this.client = client;
    }

    /** Keeps the name and label a member had before a rename. Run inside the caller's transaction. */
    public Mono<Void> record(UUID memberId, String oldName, String oldLabel, Instant changedAt) {
        DatabaseClient.GenericExecuteSpec spec = client.sql("INSERT INTO member_name_change "
                + "(member_id, old_name, old_label, changed_at) VALUES (:member, :name, :label, :at)")
                .bind("member", memberId).bind("name", oldName).bind("at", changedAt);
        spec = oldLabel == null ? spec.bindNull("label", String.class) : spec.bind("label", oldLabel);
        return spec.then();
    }

    /** Name changes per member, newest first. */
    public Mono<Map<UUID, List<NameChange>>> historyByMember() {
        return client.sql("SELECT member_id, old_name, old_label, changed_at FROM member_name_change "
                + "ORDER BY seq DESC")
                .map((row, meta) -> Map.entry(row.get("member_id", UUID.class), new NameChange(
                        row.get("old_name", String.class), row.get("old_label", String.class),
                        row.get("changed_at", Instant.class))))
                .all()
                .collect(Collectors.groupingBy(Map.Entry::getKey,
                        Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
    }
}
