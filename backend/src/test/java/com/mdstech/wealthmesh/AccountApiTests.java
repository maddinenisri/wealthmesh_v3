package com.mdstech.wealthmesh;

import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;

@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@AutoConfigureWebTestClient
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AccountApiTests {

    private static final String NO_HOUSEHOLD = "Create the household first";

    private static String mayaId;
    private static String samId;

    @Autowired
    WebTestClient webTestClient;

    @Autowired
    MutableClock clock;

    @BeforeEach
    void resetToday() {
        clock.setToday(MutableClock.DEFAULT_TODAY);
    }

    @Order(0)
    @Test
    @DisplayName("an account cannot be added before the household exists")
    void accountNeedsAHousehold() {
        post(body("Everyday Checking", "[]", "2026-09-01", "\"5000.00\""))
                .expectStatus().isEqualTo(409)
                .expectBody().jsonPath("$.message").isEqualTo(NO_HOUSEHOLD);
    }

    @Order(1)
    @Test
    @DisplayName("set up the household with Maya and Sam")
    void setUpHousehold() {
        AtomicReference<String> householdId = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/household").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\": \"Maya and Sam\"}").exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, householdId::set);
        mayaId = member(householdId.get(), "Maya");
        samId = member(householdId.get(), "Sam");
    }

    @Order(2)
    @Test
    @DisplayName("V2_CHECKING_001 create with a known initial Balance, then find it in the list and by id")
    void createWithKnownBalanceAndFindIt() {
        AtomicReference<String> id = new AtomicReference<>();
        post(body("Everyday Checking", "[\"" + mayaId + "\"]", "2026-09-01", "\"5000.00\""))
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.type").isEqualTo("checking")
                .jsonPath("$.name").isEqualTo("Everyday Checking")
                .jsonPath("$.institution").isEqualTo("Harbor Bank")
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(mayaId)
                .jsonPath("$.openedOn").isEqualTo("2026-09-01")
                .jsonPath("$.openingAmount").isEqualTo("5000.00")
                .jsonPath("$.balance.amount").isEqualTo("5000.00")
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-01")
                .jsonPath("$.id").value(String.class, id::set);

        webTestClient.get().uri("/api/v1/accounts").exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$[?(@.id=='%s')].name".formatted(id.get())).isEqualTo("Everyday Checking")
                .jsonPath("$[?(@.id=='%s')].balance.amount".formatted(id.get())).isEqualTo("5000.00")
                .jsonPath("$[?(@.id=='%s')].institution".formatted(id.get())).isEqualTo("Harbor Bank")
                .jsonPath("$[?(@.id=='%s')].ownerMemberIds[0]".formatted(id.get())).isEqualTo(mayaId)
                .jsonPath("$[?(@.id=='%s')].balance.asOf".formatted(id.get())).isEqualTo("2026-09-01");

        // The opening amount is a field of the account, not an activity row, so it can never count as income.
        webTestClient.get().uri("/api/v1/accounts/{id}", id.get()).exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.name").isEqualTo("Everyday Checking")
                .jsonPath("$.institution").isEqualTo("Harbor Bank")
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(mayaId)
                .jsonPath("$.openingAmount").isEqualTo("5000.00")
                .jsonPath("$.balance.amount").isEqualTo("5000.00")
                .jsonPath("$.status").isEqualTo("active");
    }

    @Order(3)
    @Test
    @DisplayName("a blank or 0.00 opening Balance starts the account at 0.00 on the setup date")
    void blankOrZeroBalanceStartsAtZero() {
        String[] balances = {"null", "\"\"", "\"0.00\"", "\"0\""};
        for (int i = 0; i < balances.length; i++) {
            String balance = balances[i];
            post(body("Zero " + i, "[\"" + mayaId + "\"]", "2026-09-01", balance))
                    .expectStatus().isCreated()
                    .expectBody()
                    .jsonPath("$.openingAmount").isEqualTo("0.00")
                    .jsonPath("$.balance.amount").isEqualTo("0.00")
                    .jsonPath("$.balance.asOf").isEqualTo("2026-09-01");
        }
    }

    @Order(4)
    @Test
    @DisplayName("V2_CHECKING_017 an invalid initial Balance is refused and nothing is saved")
    void invalidBalanceIsRefused() {
        int before = count();
        for (String balance : new String[] {"\"five thousand\"", "5000", "\"12.345\"", "\"$5,000.00\"", "true"}) {
            post(body("Bad Balance", "[\"" + mayaId + "\"]", "2026-09-01", balance))
                    .expectStatus().isBadRequest()
                    .expectBody().jsonPath("$.message").isEqualTo("Enter a valid amount");
        }
        org.junit.jupiter.api.Assertions.assertEquals(before, count());
    }

    @Order(5)
    @Test
    @DisplayName("V2_CHECKING_005 an incomplete setup is refused and nothing is saved")
    void incompleteSetupIsRefused() {
        int before = count();
        post(body("   ", "[\"" + mayaId + "\"]", "2026-09-01", "\"5000.00\""))
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter an account name");
        org.junit.jupiter.api.Assertions.assertEquals(before, count());
    }

    @Order(6)
    @Test
    @DisplayName("an account needs an owner from the household, a supported type and a date that is not in the future")
    void otherSetupRulesAreEnforced() {
        post(body("No Owner", "[]", "2026-09-01", "\"1.00\""))
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Choose an owner");
        post(body("Stranger", "[\"" + java.util.UUID.randomUUID() + "\"]", "2026-09-01", "\"1.00\""))
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Choose an owner from this household");
        post(body("Tomorrow", "[\"" + mayaId + "\"]", "2026-10-04", "\"1.00\""))
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("The opening date cannot be in the future");
        post(body("Today", "[\"" + mayaId + "\"]", "2026-10-03", "\"1.00\"")).expectStatus().isCreated();
        post(body("Boat", "[\"" + mayaId + "\"]", "2026-09-01", "\"1.00\"").replace("checking", "yacht"))
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Unsupported account type");
    }

    @Order(7)
    @Test
    @DisplayName("V2_CHECKING_003 edit details without changing the initial Balance or date")
    void editDetailsLeavesMoneyAlone() {
        AtomicReference<String> id = new AtomicReference<>();
        post(body("Everyday Checking", "[\"" + samId + "\"]", "2026-09-01", "\"5000.00\""))
                .expectStatus().isCreated().expectBody().jsonPath("$.id").value(String.class, id::set);

        put(id.get(), """
                {"name": "Household Checking", "institution": "Harbor Credit Union", "ownerMemberIds": ["%s"]}
                """.formatted(mayaId))
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.name").isEqualTo("Household Checking")
                .jsonPath("$.institution").isEqualTo("Harbor Credit Union")
                .jsonPath("$.ownerMemberIds.length()").isEqualTo(1)
                .jsonPath("$.ownerMemberIds[0]").isEqualTo(mayaId)
                .jsonPath("$.openingAmount").isEqualTo("5000.00")
                .jsonPath("$.openedOn").isEqualTo("2026-09-01")
                .jsonPath("$.balance.amount").isEqualTo("5000.00");

        webTestClient.get().uri("/api/v1/accounts/{id}", id.get()).exchange().expectStatus().isOk()
                .expectBody()
                .jsonPath("$.name").isEqualTo("Household Checking")
                .jsonPath("$.balance.asOf").isEqualTo("2026-09-01");

        put(id.get(), "{\"name\": \"X\", \"ownerMemberIds\": [\"%s\"], \"openingBalance\": \"1.00\"}".formatted(mayaId))
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message")
                .isEqualTo("Edit account changes details only, not the balance or date");
        put(id.get(), "{\"name\": \"X\", \"institution\": \"%s\", \"ownerMemberIds\": [\"%s\"]}"
                .formatted("x".repeat(121), mayaId))
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Bank must be 120 characters or fewer");
        put(id.get(), "{\"name\": \" \", \"ownerMemberIds\": [\"%s\"]}".formatted(mayaId))
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.message").isEqualTo("Enter an account name");
    }

    @Order(8)
    @Test
    @DisplayName("an unknown account is not found")
    void unknownAccountIsNotFound() {
        String missing = java.util.UUID.randomUUID().toString();
        webTestClient.get().uri("/api/v1/accounts/{id}", missing).exchange().expectStatus().isNotFound();
        put(missing, "{\"name\": \"X\", \"ownerMemberIds\": [\"%s\"]}".formatted(mayaId)).expectStatus().isNotFound();
    }

    @Order(9)
    @Test
    @DisplayName("today follows the injected clock")
    void todayFollowsTheClock() {
        webTestClient.get().uri("/api/v1/today").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.today").isEqualTo("2026-10-03");
        clock.setToday(LocalDate.of(2026, 9, 10));
        webTestClient.get().uri("/api/v1/today").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.today").isEqualTo("2026-09-10");
    }

    private static String body(String name, String owners, String openedOn, String balance) {
        return """
                {"type": "checking", "name": "%s", "institution": "Harbor Bank", "ownerMemberIds": %s,
                 "openedOn": "%s", "openingBalance": %s}
                """.formatted(name, owners, openedOn, balance);
    }

    private WebTestClient.ResponseSpec post(String json) {
        return webTestClient.post().uri("/api/v1/accounts").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(json).exchange();
    }

    private WebTestClient.ResponseSpec put(String id, String json) {
        return webTestClient.put().uri("/api/v1/accounts/{id}", id).contentType(MediaType.APPLICATION_JSON)
                .bodyValue(json).exchange();
    }

    private String member(String householdId, String name) {
        AtomicReference<String> id = new AtomicReference<>();
        webTestClient.post().uri("/api/v1/household-members").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"householdId\": \"%s\", \"name\": \"%s\"}".formatted(householdId, name))
                .exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.id").value(String.class, id::set);
        return id.get();
    }

    private int count() {
        AtomicReference<Integer> size = new AtomicReference<>();
        webTestClient.get().uri("/api/v1/accounts").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.length()").value(Integer.class, size::set);
        return size.get();
    }
}
