Feature: Record received income and correct its history
  Income is money actually received, not an initial Balance, a transfer or a future estimate.
  Maya and Sam use one local workspace and identify who entered each saved change.
  These independent examples use USD; saved removal keeps history and offers Undo.

  @V2_INCOME_001
  Scenario: Record take-home salary and find it from the month and account
    Given Everyday Checking starts with Balance "$5,000.00" on "2026-09-01" with no activity
    When Maya records take-home Salary "$6,000.00" received into checking on "2026-09-02" and confirms
    Then checking Balance is "$11,000.00" across list, detail and household wealth
    When she opens September Income and then the Salary entry
    Then she sees "$6,000.00", "2026-09-02", Everyday Checking, Salary and entered by Maya
    And September spending remains "$0.00" and Income minus spending is "$6,000.00"
    And the initial "$5,000.00" is not another income entry

  @V2_INCOME_002
  Scenario: Record savings interest separately from a Balance correction
    Given Emergency Savings starts with "$10,000.00" on "2026-09-01" with no activity
    When Sam records Interest income "$25.00" received on "2026-09-15" and confirms
    Then savings Balance is "$10,025.00" and September Income is "$25.00"
    And the dated Interest entry is inspectable from savings and the monthly Income view
    And there is no separate Balance correction or spending entry

  @V2_INCOME_003
  Scenario: Correct income amount, date, account and category with affected months visible
    Given checking starts with "$5,000.00" and savings with "$10,000.00" on "2026-09-01"
    And a Salary entry "$6,000.00" into checking dated "2026-09-02" is the only activity
    And today is "2026-10-03"
    When Maya reviews correcting it to Bonus "$6,200.00" received into savings on "2026-10-02"
    Then the preview shows checking Balance "$5,000.00", savings "$16,200.00", September Income "$0.00" and October Income "$6,200.00"
    When she cancels
    Then the original Salary entry, checking "$11,000.00" and savings "$10,000.00" remain unchanged
    When she repeats the reviewed correction and confirms with reason "Correct pay details"
    Then the entry shows the corrected account, amount, date and category and those previewed Balances and month totals
    And its history retains the original details, Maya, time and reason

  @V2_INCOME_004
  Scenario: Remove an incorrectly recorded salary and undo it
    Given checking starts with "$5,000.00" on "2026-09-01" and has one Salary entry "$6,000.00" dated "2026-09-02"
    When Maya reviews removing the entry
    Then the preview shows checking Balance "$5,000.00" and September Income "$0.00" and explains this does not reverse a bank deposit
    When she confirms removal
    Then the entry is excluded from active activity but remains in removal history with Undo
    When she confirms Undo
    Then checking Balance is "$11,000.00" and September Income "$6,000.00" with one effective Salary entry on its original date

  @V2_INCOME_005
  Scenario Outline: Reject an invalid received-income amount without losing context
    Given checking starts with "$5,000.00" on "2026-09-01" with no activity
    When Sam enters Salary amount "<amount>" dated "2026-09-02" and tries to save
    Then Amount says "Enter an amount greater than zero" and the account, date and Salary category remain entered
    And checking Balance remains "$5,000.00" and no Income is added

    Examples:
      | amount |
      | $0.00 |
      | -$100.00 |

  @V2_INCOME_006
  Scenario: Keep expected salary as a reminder until it is received
    Given today is "2026-09-10" and checking Balance is "$5,000.00" with no income recorded
    When Maya enters expected Salary "$6,000.00" dated "2026-09-30" as received income
    Then she is told a future date cannot be recorded as completed income and offered Save reminder
    When she saves the reminder
    Then checking Balance remains "$5,000.00" and September Income remains "$0.00"
    And the reminder shows "$6,000.00" expected "2026-09-30" rather than received money
