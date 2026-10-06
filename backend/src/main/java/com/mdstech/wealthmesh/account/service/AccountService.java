package com.mdstech.wealthmesh.account.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.dto.AccountRequest;
import com.mdstech.wealthmesh.account.dto.AccountResponse;
import com.mdstech.wealthmesh.account.dto.AccountUpdateRequest;
import com.mdstech.wealthmesh.account.mapper.AccountMapper;
import com.mdstech.wealthmesh.account.repository.AccountOwnerStore;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.household.domain.HouseholdMember;
import com.mdstech.wealthmesh.household.repository.HouseholdMemberRepository;
import com.mdstech.wealthmesh.household.repository.HouseholdRepository;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Sets up and edits accounts. Edit changes details only; money is never touched here. */
@Service
public class AccountService {

    private final AccountRepository accounts;
    private final AccountOwnerStore owners;
    private final HouseholdRepository households;
    private final HouseholdMemberRepository members;
    private final AccountMapper mapper;
    private final ActivityStore activity;
    private final Clock clock;

    public AccountService(AccountRepository accounts, AccountOwnerStore owners, HouseholdRepository households,
            HouseholdMemberRepository members, AccountMapper mapper, ActivityStore activity, Clock clock) {
        this.accounts = accounts;
        this.owners = owners;
        this.households = households;
        this.members = members;
        this.mapper = mapper;
        this.activity = activity;
        this.clock = clock;
    }

    public Flux<AccountResponse> findAll() {
        return Mono.zip(owners.ownersByAccount(), activity.deltasByAccount()).flatMapMany(known ->
                accounts.findAllByOrderByNameAscCreatedAtAsc().map(account -> mapper.toResponse(account,
                        known.getT1().getOrDefault(account.id(), List.of()),
                        mapper.balance(account, known.getT2().getOrDefault(account.id(), ActivityStore.Delta.NONE)))));
    }

    public Mono<AccountResponse> findById(UUID id) {
        return load(id).flatMap(this::respond);
    }

    @Transactional
    public Mono<AccountResponse> create(AccountRequest request) {
        return households.findAll().next()
                .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.CONFLICT,
                        "Create the household first")))
                .flatMap(household -> Mono.fromCallable(() -> parse(request, LocalDate.now(clock)))
                        .flatMap(parsed -> checkOwners(household.id(), request.ownerMemberIds(), List.of())
                                .flatMap(ownerIds -> accounts.save(mapper.toNewEntity(household.id(),
                                        parsed.type().wire(), parsed.name(), parsed.institution(), parsed.openedOn(),
                                        parsed.openingAmount()))
                                        .flatMap(saved -> owners.replace(household.id(), saved.id(), ownerIds)
                                                .thenReturn(saved))
                                        .map(saved -> mapper.toResponse(saved, ownerIds,
                                                mapper.balance(saved, ActivityStore.Delta.NONE))))));
    }

    @Transactional
    public Mono<AccountResponse> update(UUID id, AccountUpdateRequest request) {
        // The account row is locked first, so two edits of one account take turns and the owners read below are
        // the committed ones (an inactive owner cannot be put back from a stale list).
        return Mono.fromCallable(() -> requireDetailsOnly(request))
                .then(Mono.defer(() -> activity.lockAccount(id)).then(Mono.defer(() -> load(id))))
                .flatMap(existing -> owners.ownersOf(existing.id())
                        .flatMap(current -> checkOwners(existing.householdId(), request.ownerMemberIds(), current))
                        .flatMap(ownerIds -> accounts.save(mapper.toUpdatedEntity(request, existing))
                                .flatMap(saved -> owners.replace(saved.householdId(), saved.id(), ownerIds)
                                        .thenReturn(saved))
                                .flatMap(saved -> activity.deltaOf(saved.id()).map(delta -> mapper.toResponse(
                                        saved, ownerIds, mapper.balance(saved, delta))))));
    }

    /** The validated parts of a create request. */
    record NewAccount(AccountType type, String name, String institution, LocalDate openedOn,
            BigDecimal openingAmount) {
    }

    static NewAccount parse(AccountRequest request, LocalDate today) {
        String name = requireName(request.name());
        BigDecimal opening = openingAmount(request.openingBalance());
        AccountType type = AccountType.fromWire(request.type())
                .orElseThrow(() -> bad("Unsupported account type"));
        opening = signed(type, opening, request.balanceSide());
        if (type.valued() && opening.signum() < 0) {
            throw bad(type == AccountType.PROPERTY ? "Enter zero or a positive property value"
                    : "Enter zero or a positive asset value");
        }
        LocalDate openedOn = request.openedOn() == null ? today : request.openedOn();
        if (openedOn.isAfter(today)) {
            throw bad("The opening date cannot be in the future");
        }
        return new NewAccount(type, name, requireInstitution(request.institution()), openedOn, opening);
    }

    /**
     * A card's amount is entered as a positive figure with a side; it is stored with the asset sign (owed negative,
     * Card credit positive) so Balance sums and wealth need no card branch. A zero card amount needs no side.
     */
    public static BigDecimal signed(AccountType type, BigDecimal amount, String side) {
        if (type != AccountType.CREDIT_CARD) {
            if (side != null) {
                throw bad("Owed or Card credit applies to a card only");
            }
            return amount;
        }
        if (amount.signum() < 0) {
            throw bad("Enter a valid amount");
        }
        if (amount.signum() == 0) {
            return amount;
        }
        return switch (side == null ? "" : side) {
            case "owed" -> amount.negate();
            case "credit" -> amount;
            default -> throw bad("Choose Owed or Card credit");
        };
    }

    /** The same rule for an account read from the database: its type is the wire name. */
    public static BigDecimal signed(String typeWire, BigDecimal amount, String side) {
        return signed(AccountType.fromWire(typeWire).orElseThrow(), amount, side);
    }

    static String requireDetailsOnly(AccountUpdateRequest request) {
        if (request.extra() != null && !request.extra().isEmpty()) {
            throw bad("Edit account changes details only, not the balance or date");
        }
        requireInstitution(request.institution());
        return requireName(request.name());
    }

    static String requireInstitution(String institution) {
        String stripped = institution == null || institution.isBlank() ? null : institution.strip();
        if (stripped != null && stripped.length() > 120) {
            throw bad("Bank must be 120 characters or fewer");
        }
        return stripped;
    }

    static String requireName(String name) {
        String stripped = name == null ? "" : name.strip();
        if (stripped.isEmpty()) {
            throw bad("Enter an account name");
        }
        if (stripped.length() > 120) {
            throw bad("Account name must be 120 characters or fewer");
        }
        return stripped;
    }

    /** Blank or missing starts at 0.00; a string with at most two decimals is an amount; anything else is refused. */
    static BigDecimal openingAmount(Object value) {
        if (value == null) {
            return Money.parse("0").orElseThrow();
        }
        if (value instanceof String text) {
            return text.isBlank() ? Money.parse("0").orElseThrow()
                    : Money.parse(text).orElseThrow(() -> bad("Enter a valid amount"));
        }
        throw bad("Enter a valid amount");
    }

    /**
     * Owners must belong to the household. A member who is no longer active cannot become a new owner but may stay
     * on an account they already own. The member rows are read FOR SHARE so a deactivate cannot slip in between
     * this check and the save.
     */
    private Mono<List<UUID>> checkOwners(UUID householdId, List<UUID> requested, List<UUID> current) {
        if (requested == null || requested.isEmpty()) {
            return Mono.error(bad("Choose an owner"));
        }
        List<UUID> distinct = requested.stream().distinct().sorted().toList();
        return members.findByHouseholdIdForShare(householdId).collectList()
                .flatMap(inHousehold -> {
                    List<UUID> ids = inHousehold.stream().map(HouseholdMember::id).toList();
                    if (!ids.containsAll(distinct)) {
                        return Mono.error(bad("Choose an owner from this household"));
                    }
                    boolean newInactive = inHousehold.stream().anyMatch(member -> !member.active()
                            && distinct.contains(member.id()) && !current.contains(member.id()));
                    return newInactive ? Mono.error(bad("Choose an active member")) : Mono.just(distinct);
                });
    }

    private Mono<AccountResponse> respond(Account account) {
        return Mono.zip(owners.ownersOf(account.id()), activity.deltaOf(account.id()))
                .map(known -> mapper.toResponse(account, known.getT1(), mapper.balance(account, known.getT2())));
    }

    private Mono<Account> load(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id)));
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
