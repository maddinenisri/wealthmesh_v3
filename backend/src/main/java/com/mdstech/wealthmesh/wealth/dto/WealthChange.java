package com.mdstech.wealthmesh.wealth.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * What explains the change in wealth between two dates, for the rows dated after `from` and up to `to`:
 * `change = income - spending + valueChange + priceChange + payCredits + benefitInterest + corrections +
 * accountsAdded + transfers + other`, where `change` is
 * `endWealth - startWealth`. Transfers and card payments cancel (`transfers` is zero), an asset value change is never
 * income, a Balance correction never income or spending, and `other` discloses anything not explained (zero when the
 * parts add up). A defined benefit's pay and interest credits are their own terms, never income and never inside
 * `valueChange` (`creditLines` names each statement). A price move of an investment account's holdings is its own
 * term, `priceChange` (`priceMoves` names each account): never income, and never inside `valueChange`.
 * `correctionLines` names each Balance correction in the period
 * (the loan's "debt correction" is one), and `restatements` names each starting amount corrected in the period: the
 * figures on every date already use the corrected amount, so a restatement explains a difference with earlier
 * reports and is not a term of the identity.
 * Every figure is a money string.
 */
public record WealthChange(LocalDate from, LocalDate to, String startWealth, String endWealth, String change,
        String income, String spending, String valueChange, String corrections, String accountsAdded,
        String transfers, String other, List<ValueMove> valueMoves, List<CorrectionLine> correctionLines,
        List<Restatement> restatements, String payCredits, String benefitInterest, List<CreditLine> creditLines,
        String priceChange, List<PriceMove> priceMoves) {

    /** One investment account whose holdings moved in price in the period: its Balance's price part at each end. */
    public record PriceMove(String accountId, String name, String type, String start, String end, String change) {
    }

    /** One defined benefit statement dated in the period: its pay credit and benefit interest credit. */
    public record CreditLine(String accountId, String name, String payCredit, String interestCredit, LocalDate on) {
    }

    /** One Balance correction dated in the period: its signed effect on the account's Balance and why. */
    public record CorrectionLine(String accountId, String name, String type, String amount, String reason,
            LocalDate on) {
    }

    /** One starting amount corrected in the period (the date it was corrected), with what it replaced. */
    public record Restatement(String accountId, String name, String type, String previousAmount, String amount,
            String change, String reason, LocalDate madeOn) {
    }

    /** One manually valued account whose value moved in the period. */
    public record ValueMove(String accountId, String name, String type, String start, String end, String change) {
    }
}
