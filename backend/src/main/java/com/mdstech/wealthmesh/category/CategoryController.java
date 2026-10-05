package com.mdstech.wealthmesh.category;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.category.dto.CategoryChange;
import com.mdstech.wealthmesh.category.dto.CategoryEvent;
import com.mdstech.wealthmesh.category.dto.CategoryMerge;
import com.mdstech.wealthmesh.category.dto.CategoryRequest;
import com.mdstech.wealthmesh.category.dto.CategoryResponse;
import com.mdstech.wealthmesh.category.dto.CategoryUsage;
import com.mdstech.wealthmesh.category.dto.MergeResult;
import com.mdstech.wealthmesh.category.service.CategoryLifecycleService;
import com.mdstech.wealthmesh.category.service.CategoryService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/categories")
public class CategoryController {

    private final CategoryService service;
    private final CategoryLifecycleService lifecycle;

    public CategoryController(CategoryService service, CategoryLifecycleService lifecycle) {
        this.service = service;
        this.lifecycle = lifecycle;
    }

    @GetMapping
    public Flux<CategoryResponse> list(@RequestParam(required = false) String kind,
            @RequestParam(defaultValue = "false") boolean includeArchived) {
        return service.list(kind, includeArchived);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<CategoryResponse> create(@RequestBody CategoryRequest request) {
        return service.create(request);
    }

    @PostMapping("/{id}/rename")
    public Mono<CategoryResponse> rename(@PathVariable UUID id, @RequestBody CategoryChange change) {
        return lifecycle.rename(id, change);
    }

    @PostMapping("/{id}/default-class")
    public Mono<CategoryResponse> changeDefault(@PathVariable UUID id, @RequestBody CategoryChange change) {
        return lifecycle.changeDefault(id, change);
    }

    @PostMapping("/{id}/archive")
    public Mono<CategoryResponse> archive(@PathVariable UUID id, @RequestBody CategoryChange change) {
        return lifecycle.archive(id, change);
    }

    @PostMapping("/{id}/restore")
    public Mono<CategoryResponse> restore(@PathVariable UUID id, @RequestBody CategoryChange change) {
        return lifecycle.restore(id, change);
    }

    @GetMapping("/{id}/usage")
    public Mono<CategoryUsage> usage(@PathVariable UUID id) {
        return lifecycle.usage(id);
    }

    @GetMapping("/{id}/history")
    public Flux<CategoryEvent> history(@PathVariable UUID id) {
        return lifecycle.history(id);
    }

    @PostMapping("/merges")
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<MergeResult> merge(@RequestBody CategoryMerge request) {
        return lifecycle.merge(request);
    }

    @PostMapping("/merges/{mergeId}/undo")
    public Mono<List<CategoryResponse>> undoMerge(@PathVariable UUID mergeId, @RequestBody CategoryChange change) {
        return lifecycle.undoMerge(mergeId, change);
    }
}
