package com.mdstech.wealthmesh;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.account.domain.WealthGroup;

/** Slice 18a: group membership is decided once, on the type. */
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
    @DisplayName("V2_DB_006 only a defined benefit is a one-participant type so far")
    void singleOwnerTypes() {
        for (AccountType type : AccountType.values()) {
            assertThat(type.singleOwner()).as(type.name()).isEqualTo(type == AccountType.DEFINED_BENEFIT);
        }
    }
}
