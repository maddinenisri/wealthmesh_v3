package com.mdstech.wealthmesh.account;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.account.dto.AccountEvent;
import com.mdstech.wealthmesh.account.dto.AccountLifecycle;
import com.mdstech.wealthmesh.account.dto.LifecycleRequest;
import com.mdstech.wealthmesh.account.dto.AccountRequest;
import com.mdstech.wealthmesh.account.dto.AccountResponse;
import com.mdstech.wealthmesh.account.dto.AccountUpdateRequest;
import com.mdstech.wealthmesh.account.service.AccountLifecycleService;
import com.mdstech.wealthmesh.account.service.AccountService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/accounts")
public class AccountController {

    private final AccountService service;
    private final AccountLifecycleService lifecycle;

    public AccountController(AccountService service, AccountLifecycleService lifecycle) {
        this.service = service;
        this.lifecycle = lifecycle;
    }

    @GetMapping
    public Flux<AccountResponse> list() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public Mono<AccountResponse> get(@PathVariable UUID id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<AccountResponse> create(@RequestBody AccountRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public Mono<AccountResponse> update(@PathVariable UUID id, @RequestBody AccountUpdateRequest request) {
        return service.update(id, request);
    }

    @PostMapping("/{id}/archive")
    public Mono<AccountResponse> archive(@PathVariable UUID id,
            @RequestBody(required = false) LifecycleRequest request) {
        return lifecycle.archive(id, memberOf(request));
    }

    @PostMapping("/{id}/close")
    public Mono<AccountResponse> close(@PathVariable UUID id,
            @RequestBody(required = false) LifecycleRequest request) {
        return lifecycle.close(id, memberOf(request));
    }

    @PostMapping("/{id}/reopen")
    public Mono<AccountResponse> reopen(@PathVariable UUID id,
            @RequestBody(required = false) LifecycleRequest request) {
        return lifecycle.reopen(id, memberOf(request));
    }

    @GetMapping("/{id}/lifecycle")
    public Mono<AccountLifecycle> lifecycle(@PathVariable UUID id) {
        return lifecycle.lifecycle(id);
    }

    @PostMapping("/{id}/delete")
    public Mono<AccountResponse> delete(@PathVariable UUID id,
            @RequestBody(required = false) LifecycleRequest request) {
        return lifecycle.delete(id, memberOf(request));
    }

    @PostMapping("/{id}/undo-delete")
    public Mono<AccountResponse> undoDelete(@PathVariable UUID id,
            @RequestBody(required = false) LifecycleRequest request) {
        return lifecycle.undoDelete(id, memberOf(request));
    }

    @PostMapping("/{id}/restore")
    public Mono<AccountResponse> restore(@PathVariable UUID id,
            @RequestBody(required = false) LifecycleRequest request) {
        return lifecycle.restore(id, memberOf(request));
    }

    @GetMapping("/{id}/events")
    public Flux<AccountEvent> events(@PathVariable UUID id) {
        return lifecycle.events(id);
    }

    /** Who is making the change is a required body field, as on every other write (D-025). */
    private static UUID memberOf(LifecycleRequest request) {
        if (request == null || request.enteredByMemberId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose who entered this");
        }
        return request.enteredByMemberId();
    }
}
