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

import com.mdstech.wealthmesh.account.dto.AccountLifecycle;
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
    public Mono<AccountResponse> archive(@PathVariable UUID id) {
        return lifecycle.archive(id);
    }

    @PostMapping("/{id}/close")
    public Mono<AccountResponse> close(@PathVariable UUID id) {
        return lifecycle.close(id);
    }

    @PostMapping("/{id}/reopen")
    public Mono<AccountResponse> reopen(@PathVariable UUID id) {
        return lifecycle.reopen(id);
    }

    @GetMapping("/{id}/lifecycle")
    public Mono<AccountLifecycle> lifecycle(@PathVariable UUID id) {
        return lifecycle.lifecycle(id);
    }

    @PostMapping("/{id}/delete")
    public Mono<AccountResponse> delete(@PathVariable UUID id) {
        return lifecycle.delete(id);
    }

    @PostMapping("/{id}/undo-delete")
    public Mono<AccountResponse> undoDelete(@PathVariable UUID id) {
        return lifecycle.undoDelete(id);
    }

    @PostMapping("/{id}/restore")
    public Mono<AccountResponse> restore(@PathVariable UUID id) {
        return lifecycle.restore(id);
    }
}
