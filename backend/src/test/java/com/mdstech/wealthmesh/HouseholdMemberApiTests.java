package com.mdstech.wealthmesh;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;

@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
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

    @Order(0)
    @Test
    void householdIsNotFoundBeforeItIsCreated() {
        webTestClient.get()
                .uri("/api/v1/household")
                .exchange()
                .expectStatus().isNotFound()
                .expectBody()
                .jsonPath("$.message").isEqualTo("No household has been created yet");
    }

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
    void updatesAMemberAndRejectsConflictsMissingMembersAndBlankNames() {
        String samId = createSam();

        put(samId, "Samira Rivera", "Child")
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.name").isEqualTo("Samira Rivera")
                .jsonPath("$.label").isEqualTo("Child")
                .jsonPath("$.householdId").isEqualTo(householdId);

        put(samId, "alex doe", "JOINT")
                .expectStatus().isEqualTo(409)
                .expectBody()
                .jsonPath("$.message").isEqualTo(
                        "A member with this name and label already exists, or the household does not exist");

        put(UUID.randomUUID().toString(), "Nobody", "")
                .expectStatus().isNotFound();

        put(samId, "  ", "Child")
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.message").isEqualTo("Member name must be 1 to 120 characters");

        put(samId, "Samira", "x".repeat(81))
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.message").isEqualTo("Label must be 80 characters or fewer");
    }

    @Order(7)
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
    private String createSam() {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post()
                .uri("/api/v1/household-members")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"householdId\": \"%s\", \"name\": \"Sam Rivera\", \"label\": \"Child\"}"
                        .formatted(householdId))
                .exchange()
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    private WebTestClient.ResponseSpec put(String id, String name, String label) {
        return webTestClient.put()
                .uri("/api/v1/household-members/{id}", id)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"%s\", \"label\": \"%s\"}".formatted(name, label))
                .exchange();
    }
}
