Feature: Keep one checking Balance while recording and correcting money activity
  The same Balance appears in the account list, detail and household wealth.
  Initial money, dated corrections and transfers are separate from income and spending.
  These independent examples use USD; a dated initial Balance is at the start of that day.

  @V2_CHECKING_007
  Scenario: Follow take-home salary, rent and savings through one Balance
    Given checking starts with Balance "$5,000.00" and savings with "$10,000.00" on "2026-09-01"
    When Maya records take-home Salary "$6,000.00" into checking on "2026-09-02"
    And she records Rent "$1,500.00" paid from checking on "2026-09-03"
    And she confirms a "$2,000.00" transfer to savings on "2026-09-04"
    Then checking Balance is "$7,500.00" and savings Balance is "$12,000.00"
    When she opens checking activity
    Then the income, Rent expense and transfer show their dates and amounts
    And September Income is "$6,000.00", spending "$1,500.00" and Income minus spending "$4,500.00"
    And the transfer is excluded from income and spending

  @V2_CHECKING_008
  Scenario: Correct an expense amount without adding another expense
    Given checking starts with Balance "$5,000.00" on "2026-09-01" and has Rent "$1,600.00" dated "2026-09-03"
    When Maya reviews changing Rent to "$1,500.00" with reason "Correct the rent amount" and confirms
    Then checking Balance is "$3,500.00" and September Rent spending is "$1,500.00"
    And the expense history shows the old amount, new amount, Maya, confirmation time and reason
    And there is one effective Rent expense

  @V2_CHECKING_009
  Scenario: Review a dated Balance correction without inventing income
    Given checking starts with "$5,000.00" on "2026-09-01" and has one "$100.00" grocery expense on "2026-09-10"
    When Maya opens Update balance and enters "$5,000.00" dated "2026-09-30"
    Then the review shows current Balance "$4,900.00", requested Balance "$5,000.00" and a "$100.00" increase
    And it asks for a reason and explains this correction is excluded from Income and spending
    When she confirms with reason "Correct tracking to reviewed amount"
    Then the only checking Balance is "$5,000.00" across list, detail and household wealth
    And history retains the initial amount, expense and dated correction with Maya, time and reason
    And September Income is "$0.00" and spending "$100.00"

  @V2_CHECKING_010
  Scenario: Cancel a transfer after checking its destination
    Given checking starts with "$5,000.00" and savings with "$10,000.00" on "2026-09-01"
    When Maya reviews a "$2,000.00" transfer dated "2026-09-04" from checking to savings
    Then she sees both account names, amount and date
    When she cancels
    Then their Balances remain "$5,000.00" and "$10,000.00" and neither has new activity

  @V2_CHECKING_011
  Scenario: Correct a negative purchase and save it once
    Given checking starts with "$5,000.00" on "2026-09-01" with no activity
    When Maya tries a Groceries expense "-$100.00" dated "2026-09-10"
    Then Amount says "Enter an amount greater than zero" and the account, date and category remain entered
    When she changes it to "$100.00" and confirms, then repeats the same save after a slow response
    Then exactly one expense appears and checking Balance is "$4,900.00"

  @V2_CHECKING_012
  Scenario: Hide and restore an inactive zero-balance account without losing history
    Given checking started with "$100.00" and savings with "$1,000.00" on "2026-09-01"
    And Maya moved the remaining "$100.00" to savings on "2026-09-02", leaving checking Balance "$0.00"
    When Maya marks checking inactive
    Then the active list hides it, while savings Balance remains "$1,100.00"
    And the explanation says this changes the household list and does not close an account at its bank
    When she includes inactive accounts and opens checking, then restores it
    Then its initial amount and transfer remain visible and its Balance is still "$0.00"
    And no new money activity is added

  @V2_CHECKING_013
  Scenario: Correct an earlier Balance correction and keep both versions visible
    Given checking started with "$5,000.00" on "2026-09-01" and has a "$100.00" expense on "2026-09-10"
    And Maya entered a "$100.00" Balance correction on "2026-09-30", making Balance "$5,000.00"
    When she reviews changing that September 30 correction so the Balance on that date is "$4,900.00"
    Then the review shows original "$5,000.00", corrected "$4,900.00", date and requested reason
    When she cancels
    Then Balance remains "$5,000.00" with no saved change
    When she repeats and confirms with reason "Original reviewed amount was mistyped" on "2026-10-03 at 2:00 PM Eastern"
    Then the only Balance is "$4,900.00"
    And correction history retains original and corrected amounts, Maya, time and reason
    And the expense still appears once and September spending remains "$100.00"

  @V2_CHECKING_014
  Scenario: Replace an unexplained correction when the missing fee is found
    Given checking starts with "$6,000.00" on "2026-09-01" and has no recorded expenses
    And Maya confirmed a "-$40.00" Balance correction on "2026-09-30" with reason "Reviewed account amount is lower", making Balance "$5,960.00"
    When she finds an actual bank fee "$40.00" on "2026-09-30" and chooses to record it
    Then the review offers replacing that correction with the Bank fees expense
    And it shows Balance will remain "$5,960.00" and September spending will become "$40.00"
    When she confirms replacement
    Then the fee appears once and the correction history shows it was replaced by the fee
    And Balance is "$5,960.00", not "$5,920.00"

  @V2_CHECKING_015
  Scenario: Record an actual overdraft without pretending money is available
    Given checking starts with "$50.00" on "2026-09-01" with no activity
    When Sam records an actual "$80.00" bill paid on "2026-09-05" and confirms the warning
    Then checking Balance is "-$30.00" labeled "Overdrawn by $30.00"
    And spending is "$80.00" and household wealth treats the overdraft as debt
    And the notice says this records what happened and does not authorize a bank payment

  @V2_CHECKING_016
  Scenario: Review an expense dated before tracking began
    Given checking was created with Balance "$5,000.00" at the start of "2026-09-10" with no later activity
    When Maya enters an actual Rent expense "$1,500.00" dated "2026-09-03"
    Then she is asked to review historical setup because the expense is already represented in the September 10 amount
    When she reviews moving the tracking start to "2026-09-01" with initial Balance "$6,500.00"
    Then the preview shows the Rent expense and resulting Balance "$5,000.00", with September spending "$1,500.00"
    When she confirms the reviewed setup and expense together
    Then Balance remains "$5,000.00" and the expense is counted once
    And the previous tracking start and its correction remain in history

  @V2_CHECKING_018
  Scenario: Preview a backdated correction without losing later activity
    Given checking starts with "$4,900.00" on "2026-09-01"
    And its only activity is Salary "$1,000.00" received on "2026-10-02", making current Balance "$5,900.00"
    And today is "2026-10-03"
    When Maya reviews Update balance to "$5,000.00" as of "2026-09-30"
    Then she sees September 30 changes from "$4,900.00" to "$5,000.00" and current Balance will become "$6,000.00" after the October salary
    And the review shows the "$100.00" correction is excluded from September and October Income and spending
    When she confirms with reason "Correct the amount before October began"
    Then the one current Balance is "$6,000.00" and the October salary remains "$1,000.00"
    And history shows the September 30 correction with Maya, time and reason
    And viewing September 30 shows its historical Balance "$5,000.00" without replacing the current Balance
