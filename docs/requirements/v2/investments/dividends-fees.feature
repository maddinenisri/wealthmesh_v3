Feature: Record dividends, interest and fees without confusing earnings with contributions
  Earnings and costs explain changes in the same cash-and-holdings Balance.

  @V2_EARNINGS_001
  Scenario: Receive a cash dividend and move it to checking without duplicate income
    Given Redwood Brokerage starts "2026-09-01" with cash "$1,000.00" and 90 HOME shares at "$100.00", giving Balance "$10,000.00"
    And Everyday Checking starts that date at "$5,000.00"
    When Maya records HOME dividend "$50.00" paid into brokerage cash dated "2026-09-10" and saves
    Then brokerage cash is "$1,050.00" and Balance is "$10,050.00"
    And investment earnings include the dividend "$50.00" while outside funding is "$0.00"
    When Maya records a linked "$50.00" transfer from brokerage to checking dated "2026-09-15" and saves
    Then brokerage Balance is "$10,000.00" and checking Balance is "$5,050.00"
    And selected brokerage performance shows dividend earnings "$50.00" and outgoing funding "$50.00"
    And household income explanation shows the dividend once as investment income and excludes the later transfer from income
    And the wealth explanation does not add that same dividend again as separate investment growth

  @V2_EARNINGS_002
  Scenario: Reinvest a dividend as one linked income and purchase action
    Given Willow Roth IRA starts "2026-09-01" with cash "$1,000.00" and 50 HOME shares at "$100.00", giving Balance "$6,000.00"
    When Maya records dividend "$50.00" reinvested on "2026-09-10" into 0.5 HOME shares at "$100.00" with no fee
    Then the review shows dividend cash in "$50.00" and purchase cash out "$50.00" as linked parts
    When Maya saves
    Then cash remains "$1,000.00", shares become 50.5 worth "$5,050.00" and Balance is "$6,050.00"
    And the added shares have known purchase cost "$50.00" with purchase date "2026-09-10"
    And earnings are "$50.00", outside funding is "$0.00" and no dividend or purchase is recorded twice

  @V2_EARNINGS_003
  Scenario: Record cash interest and a separate account fee
    Given Meadow HSA starts "2026-09-01" with cash "$1,050.00" and 20 CARE shares at "$100.00", giving Balance "$3,050.00"
    When Maya records cash interest "$5.00" dated "2026-09-10" and account fee "$2.00" dated "2026-09-20"
    And saves the review with unchanged CARE price "$100.00"
    Then cash is "$1,053.00" and Balance is "$3,053.00"
    And net investment earnings are "$3.00" with outside funding "$0.00"
    And the fee is shown as investment cost rather than a medical expense
    And each interest and fee entry can be opened from the explanation

  @V2_EARNINGS_004
  Scenario: Recover a missing fee that had already been covered by a correction
    Given Redwood Brokerage starts "2026-09-01" with cash "$1,000.00" and no holdings
    And a September 20 cash correction of "-$5.00" with reason "Unexplained statement difference" made Balance "$995.00"
    When Sam records the actual September 20 account fee "$5.00"
    Then the review identifies the earlier correction and offers replacing it with the actual fee
    When Sam confirms replacing that correction and saves
    Then cash and Balance remain "$995.00" instead of dropping to "$990.00"
    And investment earnings show the actual fee "-$5.00" once
    And history retains the original correction as replaced, the fee and the member's explanation

  @V2_EARNINGS_005
  Scenario: Cancel a dividend reinvestment or reject an unfunded fee
    Given Willow Roth IRA has cash "$10.00" and 50 HOME shares at "$100.00" dated "2026-09-01"
    When Maya reviews dividend "$50.00" reinvested in 0.5 shares on "2026-09-10" and cancels
    Then cash remains "$10.00", shares remain 50 and Balance remains "$5,010.00"
    When Maya enters an account fee "$11.00" dated "2026-09-15"
    Then the review says "Only $10.00 cash is available" and no fee or negative cash is saved

  @V2_EARNINGS_006
  Scenario Outline: Reject invalid earnings or fees without changing cash
    Given today is "2026-10-03" and Willow Roth IRA starts "2026-09-01" with cash "$100.00" and no holdings
    When Maya enters <activity>
    Then the field explains <message> and Balance stays "$100.00"
    Examples:
      | activity | message |
      | dividend "$0.00" dated "2026-09-10" | "Enter an amount greater than zero" |
      | cash interest "-$5.00" dated "2026-09-10" | "Enter an amount greater than zero" |
      | account fee "-$2.00" dated "2026-09-10" | "Enter an amount greater than zero" |
      | cash interest "$5.00" dated "2026-10-04" | "Save a future reminder instead of completed activity" |
      | dividend "$5.00" dated "2026-08-31" | "Review the earlier tracking start before saving" |
