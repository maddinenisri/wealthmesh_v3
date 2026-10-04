package com.mdstech.wealthmesh;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;

@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@AutoConfigureWebTestClient
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HouseholdMemberApiTests {

    private static String householdId;
    private static String memberId;

    @Autowired
    WebTestClient webTestClient;

    @Order(1)
    @Test
    void createMember() {
        webTestClient.post()
                .uri("/api/v1/household")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \" Doe Family \"}")
                .exchange()
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.name").isEqualTo("Doe Family")
                .jsonPath("$.id").value(String.class, id -> householdId = id);

        webTestClient.post()
                .uri("/api/v1/household-members")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("""
                        {"householdId": "%s", "name": "  Alex Doe ", "label": "Joint"}
                        """.formatted(householdId))
                .exchange()
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.name").isEqualTo("Alex Doe")
                .jsonPath("$.label").isEqualTo("Joint")
                .jsonPath("$.householdId").isEqualTo(householdId)
                .jsonPath("$.nameKey").doesNotExist()
                .jsonPath("$.id").value(String.class, id -> memberId = id);
    }

    @Order(2)
    @Test
    void secondHouseholdIsRejectedAndRenameWorks() {
        webTestClient.post()
                .uri("/api/v1/household")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Another\"}")
                .exchange()
                .expectStatus().isEqualTo(409);

        webTestClient.put()
                .uri("/api/v1/household")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Doe-Rivera Family\"}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.name").isEqualTo("Doe-Rivera Family");

        webTestClient.get()
                .uri("/api/v1/household")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.name").isEqualTo("Doe-Rivera Family");
    }

    @Order(3)
    @Test
    void invalidAndDuplicateMembersAreRejected() {
        webTestClient.post()
                .uri("/api/v1/household-members")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"householdId\": \"%s\", \"name\": \"  \"}".formatted(householdId))
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.message").isEqualTo("Member name must be 1 to 120 characters");

        webTestClient.post()
                .uri("/api/v1/household-members")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"householdId\": \"%s\", \"name\": \"alex doe\", \"label\": \"joint\"}"
                        .formatted(householdId))
                .exchange()
                .expectStatus().isEqualTo(409);
    }

    @Order(4)
    @Test
    void getMember() {
        webTestClient.get()
                .uri("/api/v1/household-members/{id}", memberId)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.name").isEqualTo("Alex Doe");
    }

    @Order(5)
    @Test
    void listMembersByHousehold() {
        webTestClient.get()
                .uri("/api/v1/household-members?householdId={id}", householdId)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.length()").isEqualTo(1);
    }

    @Order(6)
    @Test
    void deleteMember() {
        webTestClient.delete()
                .uri("/api/v1/household-members/{id}", memberId)
                .exchange()
                .expectStatus().isNoContent();

        webTestClient.get()
                .uri("/api/v1/household-members/{id}", memberId)
                .exchange()
                .expectStatus().isNotFound();
    }
}
