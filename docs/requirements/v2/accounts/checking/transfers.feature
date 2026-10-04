Feature: Correct and remove household transfers as one action
  Editing or removing a transfer changes both accounts together and never creates spending.
  These independent examples use USD and retain reviewable saved history.

  @V2_TRANSFER_001
  Scenario: Change a transfer's amount, date and destination together
    Given checking starts with "$5,000.00", Emergency Savings with "$10,000.00" and Holiday Savings with "$500.00" on "2026-09-01"
    And Sam recorded "$2,000.00" from checking to Emergency Savings on "2026-09-04"
    When Sam reviews correcting it to "$1,500.00" from checking to Holiday Savings on "2026-09-05"
    Then the preview shows checking "$3,500.00", Emergency Savings "$10,000.00" and Holiday Savings "$2,000.00"
    When he confirms
    Then all three accounts show those Balances and the one transfer shows its corrected accounts, amount and date
    And history keeps the original transfer details and neither version counts as income or spending

  @V2_TRANSFER_002
  Scenario: Remove a transfer and undo without leaving one side behind
    Given checking started with "$5,000.00" and savings with "$10,000.00" on "2026-09-01"
    And a "$2,000.00" transfer on "2026-09-04" makes their Balances "$3,000.00" and "$12,000.00"
    When Maya reviews removing that transfer and confirms
    Then checking Balance is "$5,000.00" and savings Balance is "$10,000.00"
    And transfer history shows removal by Maya and offers Undo
    When she chooses Undo and confirms
    Then checking Balance is "$3,000.00" and savings Balance is "$12,000.00"
    And exactly one effective transfer is restored with its original date

  @V2_TRANSFER_003
  Scenario: Cancel or reject a transfer correction without changing either account
    Given checking started with "$5,000.00" and savings with "$10,000.00" on "2026-09-01"
    And their only activity is a "$2,000.00" transfer from checking to savings on "2026-09-04"
    When Sam tries to change the destination to checking itself
    Then he sees "Choose a different account" and both Balances remain "$3,000.00" and "$12,000.00"
    When he changes the amount to "$1,500.00" with savings as destination but cancels the review
    Then the original "$2,000.00" transfer remains effective in both accounts
    And Income and spending remain "$0.00"
