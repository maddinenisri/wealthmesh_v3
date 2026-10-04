package com.mdstech.wealthmesh.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;

class SpaFallbackFilterTests {

    private final SpaFallbackFilter filter = new SpaFallbackFilter();

    @ParameterizedTest
    @CsvSource({
        "GET, /, true",
        "GET, /design, true",
        "HEAD, /design, true",
        "GET, /api/v1/household, false",
        "GET, /api, false",
        "GET, /actuator/health, false",
        "GET, /assets/index-abc123.js, false",
        "GET, /favicon.svg, false",
        "POST, /design, false",
    })
    void decidesWhichRequestsGetTheApp(String method, String path, boolean expected) {
        assertThat(SpaFallbackFilter.isPageRequest(HttpMethod.valueOf(method), path)).isEqualTo(expected);
    }

    @Test
    void rewritesPageRequestsToIndexHtml() {
        AtomicReference<ServerWebExchange> seen = new AtomicReference<>();
        filter.filter(MockServerWebExchange.from(MockServerHttpRequest.get("/design").build()), exchange -> {
            seen.set(exchange);
            return reactor.core.publisher.Mono.empty();
        }).block();

        assertThat(seen.get().getRequest().getPath().value()).isEqualTo("/index.html");
    }

    @Test
    void leavesApiRequestsAlone() {
        AtomicReference<ServerWebExchange> seen = new AtomicReference<>();
        filter.filter(MockServerWebExchange.from(MockServerHttpRequest.get("/api/v1/household").build()), exchange -> {
            seen.set(exchange);
            return reactor.core.publisher.Mono.empty();
        }).block();

        assertThat(seen.get().getRequest().getPath().value()).isEqualTo("/api/v1/household");
    }
}
