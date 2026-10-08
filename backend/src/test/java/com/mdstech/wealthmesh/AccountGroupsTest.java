package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumSet;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.domain.WealthGroup;

/** Slices 18a and 18b: group membership is decided once, on the type (D-065, D-067). */
class AccountGroupsTest {

    @ParameterizedTest(name = "Q-055 {0} has one base group, and it is one of its groups")
    @EnumSource(AccountType.class)
    void everyTypeHasOneBaseGroup(AccountType type) {
        assertThat(type.baseGroup()).isNotNull();
        assertThat(type.groups()).contains(type.baseGroup());
    }

    @Test
    @DisplayName("Q-055 a defined benefit is in Retirement and in no other group")
    void definedBenefitIsRetirementOnly() {
        assertThat(AccountType.DEFINED_BENEFIT.groups()).containsExactly(WealthGroup.RETIREMENT);
        assertThat(AccountType.inGroup("defined_benefit", WealthGroup.INVESTMENTS)).isFalse();
        assertThat(AccountType.inGroup("defined_benefit", WealthGroup.PROPERTY_AND_OTHER)).isFalse();
    }

    @Test
    @DisplayName("V2_WEALTH_002 V2_WEALTH_008 the overlaps: a 401(k) and the IRAs are in Investments and Retirement, "
            + "the HSA in Investments and Health savings and not in Retirement, a brokerage in Investments only")
    void overlaps() {
        Set<WealthGroup> investmentsAndRetirement = EnumSet.of(WealthGroup.INVESTMENTS, WealthGroup.RETIREMENT);
        assertThat(AccountType.K401.groups()).isEqualTo(investmentsAndRetirement);
        assertThat(AccountType.TRADITIONAL_IRA.groups()).isEqualTo(investmentsAndRetirement);
        assertThat(AccountType.ROTH_IRA.groups()).isEqualTo(investmentsAndRetirement);
        assertThat(AccountType.HSA.groups()).containsExactlyInAnyOrder(WealthGroup.INVESTMENTS,
                WealthGroup.HEALTH_SAVINGS);
        assertThat(AccountType.HSA.groups()).doesNotContain(WealthGroup.RETIREMENT, WealthGroup.BANK_MONEY);
        assertThat(AccountType.BROKERAGE.groups()).containsExactly(WealthGroup.INVESTMENTS);
    }

    @Test
    @DisplayName("V2_WEALTH_008 only a type held in more than one group has a view: every other type is in its "
            + "base group alone, so a bank, card, debt or valued account can never be counted twice")
    void onlyInvestmentsOverlap() {
        for (AccountType type : AccountType.values()) {
            boolean overlaps = type.kind() == AccountType.Kind.INVESTMENT && type != AccountType.BROKERAGE;
            assertThat(type.groups().size()).as(type.name()).isEqualTo(overlaps ? 2 : 1);
        }
        // Investments is the only group that is not a partition tag for the types in it.
        assertThat(AccountType.BROKERAGE.baseGroup()).isEqualTo(WealthGroup.INVESTMENTS);
    }

    @Test
    @DisplayName("V2_DB_006 only a defined benefit is a one-participant type so far")
    void singleOwnerTypes() {
        for (AccountType type : AccountType.values()) {
            assertThat(type.singleOwner()).as(type.name()).isEqualTo(type == AccountType.DEFINED_BENEFIT);
        }
    }
}
