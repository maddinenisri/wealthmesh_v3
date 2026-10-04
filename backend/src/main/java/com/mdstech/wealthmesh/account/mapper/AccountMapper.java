package com.mdstech.wealthmesh.account.mapper;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.springframework.beans.factory.annotation.Autowired;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.account.dto.AccountResponse;
import com.mdstech.wealthmesh.account.dto.AccountUpdateRequest;
import com.mdstech.wealthmesh.money.Money;

@Mapper(componentModel = "spring")
public abstract class AccountMapper {

    @Autowired
    protected Clock clock;

    @Mapping(target = "ownerMemberIds", source = "owners")
    @Mapping(target = "openingAmount", source = "account.openingAmount", qualifiedByName = "money")
    @Mapping(target = "balance", source = "balance")
    public abstract AccountResponse toResponse(Account account, List<UUID> owners, AccountResponse.Balance balance);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "householdId", source = "householdId")
    @Mapping(target = "type", source = "type")
    @Mapping(target = "name", source = "name")
    @Mapping(target = "institution", source = "institution")
    @Mapping(target = "openedOn", source = "openedOn")
    @Mapping(target = "openingAmount", source = "openingAmount")
    @Mapping(target = "status", constant = "active")
    @Mapping(target = "createdAt", expression = "java(now())")
    @Mapping(target = "updatedAt", expression = "java(now())")
    public abstract Account toNewEntity(UUID householdId, String type, String name, String institution,
            LocalDate openedOn, BigDecimal openingAmount);

    @Mapping(target = "id", source = "existing.id")
    @Mapping(target = "householdId", source = "existing.householdId")
    @Mapping(target = "type", source = "existing.type")
    @Mapping(target = "name", source = "request.name", qualifiedByName = "strip")
    @Mapping(target = "institution", source = "request.institution", qualifiedByName = "stripOrNull")
    @Mapping(target = "openedOn", source = "existing.openedOn")
    @Mapping(target = "openingAmount", source = "existing.openingAmount")
    @Mapping(target = "status", source = "existing.status")
    @Mapping(target = "createdAt", source = "existing.createdAt")
    @Mapping(target = "updatedAt", expression = "java(now())")
    public abstract Account toUpdatedEntity(AccountUpdateRequest request, Account existing);

    /**
     * Balance = opening amount plus the signed activity (summed in SQL, see ActivityStore), as of the later of the
     * opening date and the latest entry. With no activity it is the opening amount as of the opening date.
     */
    public AccountResponse.Balance balance(Account account, ActivityStore.Delta delta) {
        LocalDate asOf = delta.latest() != null && delta.latest().isAfter(account.openedOn())
                ? delta.latest() : account.openedOn();
        return new AccountResponse.Balance(Money.format(account.openingAmount().add(delta.amount())), asOf);
    }

    protected Instant now() {
        return clock.instant();
    }

    @Named("money")
    protected String money(BigDecimal amount) {
        return Money.format(amount);
    }

    @Named("strip")
    protected String strip(String value) {
        return value == null ? "" : value.strip();
    }

    @Named("stripOrNull")
    protected String stripOrNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
