package com.mdstech.wealthmesh.activity.service;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.reactive.TransactionalOperator;

import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.repository.MovementStore;
import com.mdstech.wealthmesh.activity.service.MovementService.MovementKind;

/** One movement mechanism, one service per kind of movement: every rule, lock and replay is shared (D-036). */
@Configuration
public class MovementConfiguration {

    @Bean
    public MovementService transfers(AccountRepository accounts, EntryValidator validator,
            ActivityRepository activities, ActivityStore store, MovementStore movements, Clock clock,
            TransactionalOperator transactions) {
        return new MovementService(accounts, validator, activities, store, movements, MovementKind.TRANSFER, clock,
                transactions);
    }

    @Bean
    public MovementService cardPayments(AccountRepository accounts, EntryValidator validator,
            ActivityRepository activities, ActivityStore store, MovementStore movements, Clock clock,
            TransactionalOperator transactions) {
        return new MovementService(accounts, validator, activities, store, movements, MovementKind.CARD_PAYMENT,
                clock, transactions);
    }
}
