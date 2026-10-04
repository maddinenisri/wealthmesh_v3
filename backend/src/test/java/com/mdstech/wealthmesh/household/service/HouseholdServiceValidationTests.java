package com.mdstech.wealthmesh.household.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.household.dto.HouseholdRequest;

class HouseholdServiceValidationTests {

    @ParameterizedTest
    @ValueSource(strings = {"Doe Family", "  Doe Family  ", "x"})
    void acceptsNamesOfOneToOneHundredTwentyCharacters(String name) {
        HouseholdService.validate(new HouseholdRequest(name)).block();
    }

    @Test
    void acceptsTheLongestAllowedName() {
        HouseholdService.validate(new HouseholdRequest("x".repeat(120))).block();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   "})
    void rejectsMissingOrBlankNames(String name) {
        assertBadRequest(name);
    }

    @Test
    void rejectsNamesOverOneHundredTwentyCharactersAfterStripping() {
        assertBadRequest("x".repeat(121));
        assertThat(HouseholdService.validate(new HouseholdRequest("  " + "x".repeat(120) + "  ")).blockOptional())
                .isEmpty();
    }

    private static void assertBadRequest(String name) {
        assertThatThrownBy(() -> HouseholdService.validate(new HouseholdRequest(name)).block())
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getReason()).isEqualTo("Household name must be 1 to 120 characters");
                });
    }
}
