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

import com.mdstech.wealthmesh.account.dto.AccountRequest;
import com.mdstech.wealthmesh.account.dto.AccountResponse;
import com.mdstech.wealthmesh.account.dto.AccountUpdateRequest;
import com.mdstech.wealthmesh.account.service.AccountService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/accounts")
public class AccountController {

    private final AccountService service;

    public AccountController(AccountService service) {
        this.service = service;
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
}
