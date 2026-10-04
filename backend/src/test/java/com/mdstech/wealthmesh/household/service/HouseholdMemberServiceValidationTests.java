package com.mdstech.wealthmesh.household.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.household.dto.HouseholdMemberRequest;

class HouseholdMemberServiceValidationTests {

    private static final UUID HOUSEHOLD = UUID.randomUUID();

    private static HouseholdMemberRequest request(String name, String label) {
        return new HouseholdMemberRequest(HOUSEHOLD, name, label);
    }

    @ParameterizedTest
    @CsvSource(value = {"Alex Doe,Parent", "Alex Doe,", "'  Alex  ',  Parent  ", "x,NIL"}, nullValues = "NIL")
    void acceptsValidNamesWithOrWithoutALabel(String name, String label) {
        HouseholdMemberService.validate(request(name, label)).block();
    }

    @Test
    void acceptsTheLongestAllowedNameAndLabel() {
        HouseholdMemberService.validate(request("n".repeat(120), "l".repeat(80))).block();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   "})
    void rejectsMissingOrBlankNames(String name) {
        assertBadRequest(request(name, "Parent"), "Member name must be 1 to 120 characters");
    }

    @Test
    void rejectsNamesOverOneHundredTwentyCharacters() {
        assertBadRequest(request("n".repeat(121), null), "Member name must be 1 to 120 characters");
    }

    @Test
    void rejectsLabelsOverEightyCharacters() {
        assertBadRequest(request("Alex", "l".repeat(81)), "Label must be 80 characters or fewer");
    }

    private static void assertBadRequest(HouseholdMemberRequest request, String message) {
        assertThatThrownBy(() -> HouseholdMemberService.validate(request).block())
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getReason()).isEqualTo(message);
                });
    }
}
