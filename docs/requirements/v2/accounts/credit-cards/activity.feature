Feature: Keep one card Balance through purchases, refunds, fees and payments
  Recording a payment tracks a payment already made from a household bank account.
  Owed and Card credit are opposite meanings of the same Balance, never competing account totals.
  The independent examples use USD and saved history remains reviewable after corrections or removal.

  @V2_CARD_006
  Scenario: Follow a purchase, refund and payment to the remaining debt
    Given card Balance starts at "$1,000.00 owed" and checking at "$5,000.00" on "2026-09-01"
    When Maya records card Groceries "$100.00" on "2026-09-10", its "$20.00" refund on "2026-09-12" and payment "$500.00" from checking on "2026-09-20"
    Then card Balance is "$580.00 owed" and checking Balance "$4,500.00" across list, detail and wealth
    When she opens card activity and September Groceries
    Then she can inspect each dated entry and Groceries spending is "$80.00"
    And the payment is excluded from Income and spending

  @V2_CARD_007
  Scenario: Review a card payment's bank account and cancel
    Given card Balance starts at "$1,000.00 owed" and checking at "$5,000.00" on "2026-09-01"
    When Maya chooses Record payment from the card detail
    Then the destination is the card and she chooses the bank account that paid it
    When she reviews checking to card "$500.00" dated "2026-09-20" but cancels
    Then Balances remain "$1,000.00 owed" and "$5,000.00" with no payment

  @V2_CARD_008
  Scenario: Show a refund received without a matching purchase this month
    Given card Balance starts at "$0.00 owed" on "2026-09-01" with no September purchases
    When Maya records a Groceries refund "$20.00" on "2026-09-12"
    Then the one card Balance shows "$20.00 Card credit"
    And September Groceries spending is "-$20.00", explained as refunds exceeding purchases
    And the refund is neither Salary income nor hidden as zero spending

  @V2_CARD_009
  Scenario: Reject a negative purchase and cancel its correction
    Given card Balance starts at "$1,000.00 owed" on "2026-09-01" with no purchases
    When Maya tries a Groceries purchase "-$100.00" dated "2026-09-10"
    Then Amount says "Enter an amount greater than zero" and the account, date and category stay selected
    When she corrects it to "$100.00" but cancels
    Then Balance remains "$1,000.00 owed" with no purchase

  @V2_CARD_010
  Scenario: Review a card statement and make one dated Balance correction
    Given card Balance starts at "$1,000.00 owed" and checking at "$5,000.00" on "2026-09-01"
    And card activity is a "$100.00" purchase, "$20.00" refund and "$500.00" checking payment on September 10, 12 and 20
    And Maya's September 30 statement shows "$600.00 owed" as supporting information
    When she reviews Update balance to "$600.00 owed" dated "2026-09-30"
    Then she sees current "$580.00 owed", requested "$600.00 owed" and an increase in debt "$20.00"
    When she confirms with reason "Correct to reviewed amount while investigating the difference"
    Then the single card Balance is "$600.00 owed" and checking remains "$4,500.00"
    And history keeps the statement reference and correction with Maya, time and reason
    And spending remains "$80.00" because no actual fee or purchase was recorded by the correction

  @V2_CARD_011
  Scenario: Record actual card interest and fees as spending once
    Given card Balance starts at "$1,000.00 owed" on "2026-09-01" with no purchases
    When Sam records Interest charged "$15.00" on "2026-09-25" and Annual fee "$25.00" on "2026-09-26"
    Then card Balance is "$1,040.00 owed" and September spending is "$40.00"
    And each charge appears under its expense category, not as bank Interest income

  @V2_CARD_012
  Scenario: Record an overpayment as Card credit rather than extra spending
    Given card Balance starts at "$100.00 owed" and checking at "$5,000.00" on "2026-09-01"
    When Sam reviews an actual "$150.00" checking payment to the card dated "2026-09-20"
    Then the review explains the resulting "$50.00 Card credit" and checking Balance "$4,850.00"
    When he confirms
    Then those are the single account Balances and Income and spending remain "$0.00"
    When he records a card purchase "$20.00" on "2026-09-21"
    Then card Balance is "$30.00 Card credit" and spending "$20.00"

  @V2_CARD_013
  Scenario: Correct and remove a recorded card payment with both accounts kept together
    Given card Balance started at "$1,000.00 owed" and checking at "$5,000.00" on "2026-09-01"
    And their only activity is a "$500.00" payment on "2026-09-20"
    When Maya reviews changing that payment to "$400.00" dated "2026-09-21" and confirms
    Then card Balance is "$600.00 owed" and checking "$4,600.00" with the corrected payment date
    When she reviews removing the payment and confirms
    Then card Balance is "$1,000.00 owed" and checking "$5,000.00" with removal history and Undo available
    When she confirms Undo
    Then card Balance is "$600.00 owed" and checking "$4,600.00" with one effective "$400.00" payment
    And Income and spending remain "$0.00" through correction, removal and Undo
