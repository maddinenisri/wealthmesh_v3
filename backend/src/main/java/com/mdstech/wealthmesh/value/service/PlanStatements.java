package com.mdstech.wealthmesh.value.service;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.mdstech.wealthmesh.account.domain.Account;
import com.mdstech.wealthmesh.account.domain.AccountType;
import com.mdstech.wealthmesh.activity.service.EntryValidator;
import com.mdstech.wealthmesh.money.Money;
import com.mdstech.wealthmesh.value.dto.ValueRequest;

/**
 * The rules that belong to a defined benefit's plan statements (slice 18a): a statement may report a pay credit and a
 * benefit interest credit instead of a typed plan value, the plan takes no future plan (only completed statements
 * count), and its refusals use the plan's own words. A review and a save both call these, so what Confirm refuses is
 * refused in the review too.
 */
final class PlanStatements {

    /** The two credits of a statement; both are present or neither is. */
    record Credits(BigDecimal pay, BigDecimal interest) {
    }

    private PlanStatements() {
    }

    static boolean isPlanValue(Account account) {
        return AccountType.DEFINED_BENEFIT.wire().equals(account.type());
    }

    /** The credits the request reports, or null when it types a plan value; a request that fits neither is refused. */
    static Credits credits(Account account, ValueRequest request, boolean plan, boolean correction) {
        boolean credited = request.payCredit() != null || request.interestCredit() != null;
        if (credited) {
            if (!isPlanValue(account)) {
                throw EntryValidator.bad("Credits apply to a defined benefit only");
            }
            if (correction) {
                throw EntryValidator.bad("A correction restates the plan value. Enter the corrected value");
            }
            if (request.amount() != null) {
                throw EntryValidator.bad("Enter a plan value or credits, not both");
            }
            return new Credits(credit(request.payCredit(), "Pay credit"),
                    credit(request.interestCredit(), "Benefit interest"));
        }
        if (isPlanValue(account) && request.amount() == null && !plan) {
            throw EntryValidator.bad("Enter a plan value or a credit");
        }
        return null;
    }

    /** A credit is a money string of zero or more; a blank one counts as $0.00 once the other is given. */
    static BigDecimal credit(Object value, String name) {
        if (value == null || value instanceof String text && text.isBlank()) {
            return BigDecimal.ZERO.setScale(2);
        }
        if (!(value instanceof String text) || Money.parse(text).isEmpty()) {
            throw EntryValidator.bad("Enter a valid amount");
        }
        BigDecimal amount = Money.parse(text).orElseThrow();
        if (amount.signum() < 0) {
            throw EntryValidator.bad(name + " must be zero or greater");
        }
        return amount;
    }

    /** A plan statement is dated today or earlier and not before the tracking start; no future plan (Q-058). */
    static void checkDate(Account account, LocalDate valueOn, boolean plan, LocalDate today) {
        if (!isPlanValue(account)) {
            return;
        }
        if (plan || valueOn.isAfter(today)) {
            throw EntryValidator.bad("Future values are not completed account history");
        }
        if (valueOn.isBefore(account.openedOn())) {
            throw EntryValidator.bad("Review the earlier tracking start before saving. The start is "
                    + account.openedOn() + ".");
        }
    }

    /** The refusal of a negative typed value, in the type's words. */
    static String negativeMessage(Account account) {
        if (isPlanValue(account)) {
            return "Plan value must be zero or greater";
        }
        return AccountType.PROPERTY.wire().equals(account.type()) ? "Enter zero or a positive property value"
                : "Enter zero or a positive asset value";
    }
}
