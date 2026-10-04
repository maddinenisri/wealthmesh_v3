package com.mdstech.wealthmesh.category.service;

import org.springframework.stereotype.Service;

import com.mdstech.wealthmesh.category.dto.CategoryResponse;
import com.mdstech.wealthmesh.category.repository.CategoryRepository;

import reactor.core.publisher.Flux;

/** The seeded, read-only category list (D-020). */
@Service
public class CategoryService {

    private final CategoryRepository categories;

    public CategoryService(CategoryRepository categories) {
        this.categories = categories;
    }

    /** All categories, or only one kind ("spending" or "income"). */
    public Flux<CategoryResponse> list(String kind) {
        var found = kind == null || kind.isBlank() ? categories.findAllByOrderBySortOrder()
                : categories.findAllByKindOrderBySortOrder(kind);
        return found.map(c -> new CategoryResponse(c.id(), c.name(), c.kind()));
    }
}
