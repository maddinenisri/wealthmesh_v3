package com.mdstech.wealthmesh.category;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mdstech.wealthmesh.category.dto.CategoryResponse;
import com.mdstech.wealthmesh.category.service.CategoryService;

import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/api/v1/categories")
public class CategoryController {

    private final CategoryService service;

    public CategoryController(CategoryService service) {
        this.service = service;
    }

    @GetMapping
    public Flux<CategoryResponse> list(@RequestParam(required = false) String kind) {
        return service.list(kind);
    }
}
