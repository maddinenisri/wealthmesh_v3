Feature: Track loan debt and the principal part of payments
  As Maya and Sam
  We want a simple amount owed for a car or personal loan
  So payments reduce debt without classifying principal as spending

  @V2_LOAN_001
  Scenario: Create, view and edit a loan
    Given Maya and Sam are active household members
    When Maya adds Loan named "Car Loan" with lender "Maple Credit" and joint owners Maya and Sam
    And enters $20,000.00 owed dated September 1, 2026
    And reviews and confirms
    Then Car Loan shows one Balance labelled "$20,000.00 owed" in the list and details
    And Loans includes $20,000.00 debt once in household wealth
    When she edits the name to "Blue Car Loan" and confirms
    Then its name changes and the lender, owners, Balance and date remain unchanged

  @V2_LOAN_002
  Scenario: Leave the optional initial debt blank
    Given Sam is adding Loan named "Personal Loan"
    When he leaves Balance blank and reviews and confirms setup dated September 1, 2026
    Then Personal Loan shows $0.00 owed on that date
    And it adds $0.00 to household debt without another zero-confirmation action

  @V2_LOAN_003
  Scenario: Record one car loan payment with principal and interest
    Given checking has $5,000.00 and Car Loan has $20,000.00 owed
    And these are the household's only accounts
    When Maya records a $500.00 payment from checking on September 15, 2026
    And splits it into $450.00 loan principal and $50.00 interest
    And reviews and confirms
    Then checking has $4,500.00 and Car Loan has $19,550.00 owed
    And spending includes $50.00 in Loan interest and excludes the $450.00 principal
    And net worth changes from negative $15,000.00 to negative $15,050.00
    And opening the payment from either account shows one linked $500.00 payment and its portions

  @V2_LOAN_004
  Scenario: Review a debt correction without inventing a payment
    Given Car Loan has $20,000.00 owed on September 1, 2026
    When Sam reviews correcting its initial amount to $19,800.00 with reason "Copied the lender amount incorrectly"
    And confirms
    Then the one Balance is $19,800.00 owed everywhere
    And history keeps the original amount, reason and selected member
    And no checking withdrawal, income or spending is created
    And the wealth explanation identifies a $200.00 debt correction

  @V2_LOAN_005
  Scenario Outline: Reject invalid initial loan debt
    Given Maya is creating Car Loan
    When she enters Balance <amount> and tries to save
    Then she sees <message> and no loan is created

    Examples:
      | amount | message |
      | -1.00 | Enter zero or a positive amount owed |
      | abc | Enter a valid amount |

  @V2_LOAN_006
  Scenario: Review an overpayment instead of silently turning debt into an asset
    Given Car Loan has $100.00 owed and checking has $5,000.00
    When Maya proposes a payment with $150.00 principal and $10.00 interest
    Then the review explains that principal exceeds debt by $50.00
    And she must correct the principal or separately record an actual lender refund or other asset
    And no payment is confirmed and both balances remain unchanged
