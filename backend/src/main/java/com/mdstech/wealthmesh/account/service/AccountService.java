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
import com.mdstech.wealthmesh.account.repository.AccountUsageStore;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.service.EntryValidator;
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
    private final EntryValidator validator;
    private final AccountUsageStore usage;
    private final Clock clock;

    public AccountService(AccountRepository accounts, AccountOwnerStore owners, HouseholdRepository households,
            HouseholdMemberRepository members, AccountMapper mapper, ActivityStore activity, EntryValidator validator,
            AccountUsageStore usage, Clock clock) {
        this.validator = validator;
        this.usage = usage;
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
                        .flatMap(parsed -> checkOwners(household.id(), request.ownerMemberIds(), List.of(),
                                parsed.type())
                                .flatMap(ownerIds -> creator(household.id(), parsed.type(), request)
                                .flatMap(creatorId -> accounts.save(mapper.toNewEntity(household.id(),
                                        parsed.type().wire(), parsed.name(), parsed.institution(), parsed.openedOn(),
                                        parsed.openingAmount()))
                                        .flatMap(saved -> owners.replace(household.id(), saved.id(), ownerIds)
                                                .then(parsed.type().recordsCreator()
                                                        ? usage.recordEvent(saved.id(), "set_up", creatorId.get(),
                                                                clock.instant())
                                                        : Mono.<Void>empty())
                                                .thenReturn(saved))
                                        .map(saved -> mapper.toResponse(saved, ownerIds,
                                                mapper.balance(saved, ActivityStore.Delta.NONE)))))));
    }

    /** The member who entered a type that records its creator (read FOR SHARE), else nobody. */
    private Mono<java.util.Optional<UUID>> creator(UUID householdId, AccountType type, AccountRequest request) {
        return type.recordsCreator() ? validator.memberLocked(householdId, request.enteredByMemberId())
                .map(java.util.Optional::of) : Mono.just(java.util.Optional.empty());
    }

    @Transactional
    public Mono<AccountResponse> update(UUID id, AccountUpdateRequest request) {
        // The account row is locked first, so two edits of one account take turns and the owners read below are
        // the committed ones (an inactive owner cannot be put back from a stale list).
        return Mono.fromCallable(() -> requireDetailsOnly(request))
                .then(Mono.defer(() -> activity.lockAccount(id)).then(Mono.defer(() -> load(id))))
                .flatMap(existing -> Mono.fromRunnable(() -> requireInstitution(request.institution(),
                        AccountType.fromWire(existing.type()).orElseThrow()))
                        .then(owners.ownersOf(existing.id()))
                        .flatMap(current -> checkOwners(existing.householdId(), request.ownerMemberIds(), current,
                                AccountType.fromWire(existing.type()).orElseThrow()))
                        .flatMap(ownerIds -> editor(existing.householdId(), request.enteredByMemberId())
                                .flatMap(editor -> accounts.save(mapper.toUpdatedEntity(request, existing))
                                .flatMap(saved -> owners.replace(saved.householdId(), saved.id(), ownerIds)
                                        .then(renamed(existing, saved, editor))
                                        .thenReturn(saved))
                                .flatMap(saved -> activity.deltaOf(saved.id()).map(delta -> mapper.toResponse(
                                        saved, ownerIds, mapper.balance(saved, delta)))))));
    }

    /** The member who made an edit (read FOR SHARE, so an inactive or foreign member is refused), else nobody. */
    private Mono<java.util.Optional<UUID>> editor(UUID householdId, UUID memberId) {
        return memberId == null ? Mono.just(java.util.Optional.empty())
                : validator.memberLocked(householdId, memberId).map(java.util.Optional::of);
    }

    /** A rename adds one history row naming the name it replaced (Q-062); any other edit adds none. */
    private Mono<Void> renamed(Account before, Account after, java.util.Optional<UUID> editor) {
        return before.name().equals(after.name()) ? Mono.empty()
                : usage.recordEvent(after.id(), "renamed", editor.orElse(null), clock.instant(), before.name());
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
        if (request.opening() != null) {
            throw bad("Cash and holdings apply to an investment account only");
        }
        if (request.enteredByMemberId() != null && !type.recordsCreator()) {
            throw bad("Who set it up applies to an investment account or a defined benefit only");
        }
        opening = signed(type, opening, request.balanceSide());
        if (type.valued() && opening.signum() < 0) {
            throw bad(type == AccountType.PROPERTY ? "Enter zero or a positive property value"
                    : type == AccountType.DEFINED_BENEFIT ? "Plan value must be zero or greater"
                    : "Enter zero or a positive asset value");
        }
        LocalDate openedOn = request.openedOn() == null ? today : request.openedOn();
        if (openedOn.isAfter(today)) {
            throw bad("The opening date cannot be in the future");
        }
        return new NewAccount(type, name, requireInstitution(request.institution(), type), openedOn, opening);
    }

    /**
     * A card's amount is entered as a positive figure with a side; it is stored with the asset sign (owed negative,
     * Card credit positive) so Balance sums and wealth need no card branch. A zero card amount needs no side.
     */
    public static BigDecimal signed(AccountType type, BigDecimal amount, String side) {
        if (type.kind() == AccountType.Kind.DEBT) {
            return owed(amount, side);
        }
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

    /** A debt is typed as a positive amount owed with no side, and stored negative like a card that is owed. */
    private static BigDecimal owed(BigDecimal amount, String side) {
        if (side != null) {
            throw bad("Owed or Card credit applies to a card only");
        }
        if (amount.signum() < 0) {
            throw bad("Enter zero or a positive amount owed");
        }
        return amount.negate();
    }

    /** The same rule for an account read from the database: its type is the wire name. */
    public static BigDecimal signed(String typeWire, BigDecimal amount, String side) {
        return signed(AccountType.fromWire(typeWire).orElseThrow(), amount, side);
    }

    static String requireDetailsOnly(AccountUpdateRequest request) {
        if (request.extra() != null && !request.extra().isEmpty()) {
            throw bad("Edit account changes details only, not the balance or date");
        }
        return requireName(request.name());
    }

    /** The lender of a loan or mortgage or the bank of any other account, at most 120 characters. */
    public static String requireInstitution(String institution, AccountType type) {
        String stripped = institution == null || institution.isBlank() ? null : institution.strip();
        if (stripped != null && stripped.length() > 120) {
            throw bad(institutionWord(type) + " must be 120 characters or fewer");
        }
        return stripped;
    }

    private static String institutionWord(AccountType type) {
        if (type.kind() == AccountType.Kind.DEBT) {
            return "Lender";
        }
        return type.kind() == AccountType.Kind.INVESTMENT ? "Institution" : "Bank";
    }

    public static String requireName(String name) {
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
    public Mono<List<UUID>> checkOwners(UUID householdId, List<UUID> requested, List<UUID> current,
            AccountType type) {
        if (requested == null || requested.isEmpty()) {
            return Mono.error(bad("Choose an owner"));
        }
        List<UUID> distinct = requested.stream().distinct().sorted().toList();
        if (type.singleOwner() && distinct.size() > 1) {
            return Mono.error(bad(type.singleOwnerMessage()));
        }
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
