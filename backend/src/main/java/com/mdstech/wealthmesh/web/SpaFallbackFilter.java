package com.mdstech.wealthmesh.web;

import org.springframework.http.HttpMethod;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import reactor.core.publisher.Mono;

/**
 * Serves the React app's index.html for page addresses such as /design, so a browser
 * refresh or a shared link works with client-side routing. API, actuator and file
 * requests (anything with an extension) pass through untouched.
 */
@Component
public class SpaFallbackFilter implements WebFilter {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        if (isPageRequest(request.getMethod(), request.getPath().pathWithinApplication().value())) {
            ServerHttpRequest index = request.mutate().path("/index.html").build();
            return chain.filter(exchange.mutate().request(index).build());
        }
        return chain.filter(exchange);
    }

    static boolean isPageRequest(HttpMethod method, String path) {
        if (!HttpMethod.GET.equals(method) && !HttpMethod.HEAD.equals(method)) {
            return false;
        }
        if (path.equals("/api") || path.startsWith("/api/") || path.startsWith("/actuator")) {
            return false;
        }
        String lastSegment = path.substring(path.lastIndexOf('/') + 1);
        return !lastSegment.contains(".");
    }
}
