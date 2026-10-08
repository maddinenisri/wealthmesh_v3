package com.mdstech.wealthmesh.investment.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountState;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.dto.AccountRequest;
import com.mdstech.wealthmesh.account.dto.AccountResponse;
import com.mdstech.wealthmesh.account.repository.AccountOwnerStore;
import com.mdstech.wealthmesh.account.repository.AccountRepository;
import com.mdstech.wealthmesh.account.repository.AccountUsageStore;
import com.mdstech.wealthmesh.account.service.AccountService;
import com.mdstech.wealthmesh.activity.repository.ActivityStore;
import com.mdstech.wealthmesh.activity.service.EntryValidator;
import com.mdstech.wealthmesh.household.domain.Household;
import com.mdstech.wealthmesh.household.repository.HouseholdRepository;
import com.mdstech.wealthmesh.investment.dto.FinishRequest;
import com.mdstech.wealthmesh.investment.dto.HoldingLine;
import com.mdstech.wealthmesh.investment.dto.OpeningPreview;
import com.mdstech.wealthmesh.investment.dto.OpeningView;
import com.mdstech.wealthmesh.investment.repository.OpeningStore;
import com.mdstech.wealthmesh.money.Money;

import reactor.core.publisher.Mono;

/**
 * Sets up an investment account from its opening components (slice 17, T7 and T8): review, save, the draft that waits
 * for cash, Finish setup, and the quick discard of a draft. Complete components save an active account whose opening
 * amount is cash plus holdings; a typed total that differs is refused; a missing cash is never inferred, so anything
 * else entered saves a draft that is not in wealth. The writes of an existing draft take the account row lock first.
 */
@Service
public class InvestmentSetupService {

    private final HouseholdRepository households;
    private final AccountRepository accounts;
    private final AccountOwnerStore owners;
    private final AccountService accountService;
    private final OpeningStore store;
    private final ActivityStore lock;
    private final AccountUsageStore usage;
    private final EntryValidator validator;
    private final TransactionalOperator transactions;
    private final Clock clock;

    public InvestmentSetupService(HouseholdRepository households, AccountRepository accounts,
            AccountOwnerStore owners, AccountService accountService, OpeningStore store, ActivityStore lock,
            AccountUsageStore usage, EntryValidator validator, TransactionalOperator transactions, Clock clock) {
        this.households = households;
        this.accounts = accounts;
        this.owners = owners;
        this.accountService = accountService;
        this.store = store;
        this.lock = lock;
        this.usage = usage;
        this.validator = validator;
        this.transactions = transactions;
        this.clock = clock;
    }

    /** The parts of a create request that are not components, checked. */
    private record Header(AccountType type, String name, String institution, LocalDate openedOn,
            OpeningComponents components) {
    }

    private Header header(AccountRequest request) {
        LocalDate today = LocalDate.now(clock);
        String name = AccountService.requireName(request.name());
        AccountType type = AccountType.fromWire(request.type()).filter(t -> t.kind() == AccountType.Kind.INVESTMENT)
                .orElseThrow(() -> bad("Unsupported account type"));
        if (request.openingBalance() != null || request.balanceSide() != null) {
            throw bad("Enter the cash and holdings of an investment account instead of one balance");
        }
        LocalDate openedOn = request.openedOn() == null ? today : request.openedOn();
        if (openedOn.isAfter(today)) {
            throw bad("The opening date cannot be in the future");
        }
        return new Header(type, name, AccountService.requireInstitution(request.institution(), type), openedOn,
                OpeningComponents.parse(request.opening(), openedOn, today));
    }

    private Mono<Household> household() {
        return households.findAll().next().switchIfEmpty(Mono.error(new ResponseStatusException(
                HttpStatus.CONFLICT, "Create the household first")));
    }

    /** The review of a new setup: the same checks as a save, writing nothing. */
    public Mono<OpeningPreview> preview(AccountRequest request, UUID accountId) {
        // Finishing a draft keeps its owners: one who has since been deactivated may stay, as an edit allows.
        Mono<List<UUID>> current = accountId == null ? Mono.just(List.<UUID>of()) : owners.ownersOf(accountId);
        return household().flatMap(household -> Mono.fromCallable(() -> header(request))
                .flatMap(head -> current.flatMap(kept -> accountService.checkOwners(household.id(),
                        request.ownerMemberIds(), kept, head.type())).thenReturn(head.components().preview())));
    }

    /** Saves a complete setup as an active account, or an incomplete one as a draft; a mismatch is refused. */
    public Mono<AccountResponse> create(AccountRequest request) {
        return transactions.transactional(household().flatMap(household -> Mono.fromCallable(() -> header(request))
                .flatMap(head -> {
                    OpeningComponents components = head.components();
                    if (components.state() == OpeningComponents.State.MISMATCH) {
                        return Mono.<AccountResponse>error(bad(components.mismatchMessage()));
                    }
                    boolean draft = components.state() == OpeningComponents.State.DRAFT;
                    return validator.memberLocked(household.id(), request.enteredByMemberId())
                            .flatMap(memberId -> accountService.checkOwners(household.id(),
                                    request.ownerMemberIds(), List.of(), head.type())
                            .flatMap(ownerIds -> accounts.save(new Account(null, household.id(),
                                    head.type().wire(), head.name(), head.institution(), head.openedOn(),
                                    openingAmount(components), draft ? "draft" : AccountState.ACTIVE,
                                    clock.instant(), clock.instant()))
                                    .flatMap(saved -> owners.replace(household.id(), saved.id(), ownerIds)
                                            .then(store.save(saved.id(), components, clock.instant()))
                                            .then(usage.recordEvent(saved.id(), draft ? "drafted" : "set_up",
                                                    memberId, clock.instant()))
                                            .then(Mono.defer(() -> accountService.findById(saved.id()))))));
                })));
    }

    /** Finish setup: the draft takes the components again and becomes active when they are complete. */
    public Mono<AccountResponse> finish(UUID id, FinishRequest request) {
        Mono<UUID> work = lock.lockAccount(id)
                .switchIfEmpty(Mono.error(notFound(id)))
                .then(Mono.defer(() -> accounts.findById(id)))
                .switchIfEmpty(Mono.error(notFound(id)))
                .flatMap(account -> requireDraft(account, "is already set up")
                        .then(Mono.defer(() -> validator.memberLocked(account, request.enteredByMemberId())))
                        .flatMap(memberId -> Mono.fromCallable(() -> OpeningComponents.parse(request.opening(),
                                account.openedOn(), LocalDate.now(clock))).flatMap(components -> {
                                    if (components.state() == OpeningComponents.State.MISMATCH) {
                                        return Mono.<UUID>error(bad(components.mismatchMessage()));
                                    }
                                    boolean complete = components.state() == OpeningComponents.State.COMPLETE;
                                    Mono<Void> status = complete ? accounts.save(new Account(account.id(),
                                            account.householdId(), account.type(), account.name(),
                                            account.institution(), account.openedOn(), openingAmount(components),
                                            AccountState.ACTIVE, account.createdAt(), clock.instant()))
                                            .then(Mono.defer(() -> usage.recordEvent(id, "setup_finished", memberId,
                                                    clock.instant())))
                                            : Mono.empty();
                                    return store.save(id, components, clock.instant()).then(status).thenReturn(id);
                                })));
        return transactions.transactional(work).then(Mono.defer(() -> accountService.findById(id)));
    }

    /** Quick discard of a draft: gone from the list at once, no review and no Undo (V2_BROKERAGE_003). */
    public Mono<AccountResponse> discard(UUID id, UUID memberId) {
        Mono<AccountResponse> work = lock.lockAccount(id)
                .switchIfEmpty(Mono.error(notFound(id)))
                .then(Mono.defer(() -> accounts.findById(id)))
                .switchIfEmpty(Mono.error(notFound(id)))
                .flatMap(account -> requireDraft(account, "is not a draft; delete it from its page instead")
                        .then(Mono.defer(() -> validator.memberLocked(account, memberId)))
                        .then(Mono.defer(() -> accountService.findById(id)))
                        .flatMap(response -> usage.setDeleted(id, clock.instant())
                                .then(Mono.defer(() -> usage.recordEvent(id, "discarded", memberId, clock.instant())))
                                .thenReturn(response)));
        return transactions.transactional(work);
    }

    /** What the account was opened with. */
    public Mono<OpeningView> opening(UUID id) {
        return accounts.findById(id).switchIfEmpty(Mono.error(notFound(id)))
                .flatMap(account -> store.of(id).switchIfEmpty(Mono.error(new ResponseStatusException(
                        HttpStatus.NOT_FOUND, account.name() + " has no opening cash and holdings"))))
                .map(stored -> {
                    OpeningComponents c = stored.components();
                    List<HoldingLine> lines = c.lines().stream().map(OpeningComponents::shown).toList();
                    return new OpeningView(c.total() == null ? null : Money.format(c.total()),
                            c.cash() == null ? null : Money.format(c.cash()), Money.format(c.holdingsValue()),
                            c.blank(), lines, stored.statementId(), stored.statementRemoved());
                });
    }

    private static BigDecimal openingAmount(OpeningComponents components) {
        return components.state() == OpeningComponents.State.DRAFT ? BigDecimal.ZERO.setScale(2)
                : components.calculatedBalance();
    }

    private static Mono<Void> requireDraft(Account account, String why) {
        return "draft".equals(account.status()) ? Mono.empty()
                : Mono.error(new ResponseStatusException(HttpStatus.CONFLICT, account.name() + " " + why));
    }

    private static ResponseStatusException notFound(UUID id) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found: " + id);
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
