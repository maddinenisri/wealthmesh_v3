Feature: Follow savings transfers, interest and reviewed corrections through one Balance
  Savings, checking and household wealth use the same account Balance.
  Each independent example uses USD and only the activity it describes.

  @V2_SAVINGS_006
  Scenario: Follow saving, interest and a transfer back to checking
    Given savings starts with "$10,000.00" and checking with "$5,000.00" on "2026-09-01"
    When Sam records "$2,000.00" from checking to savings on "2026-09-04"
    And he records Interest income "$25.00" into savings on "2026-09-15"
    And he records "$500.00" from savings back to checking on "2026-09-20"
    Then savings Balance is "$11,525.00" and checking Balance is "$3,500.00"
    When he opens savings activity
    Then transfers name both accounts and the "$25.00" appears as Interest income
    And household Income is "$25.00" and spending "$0.00"

  @V2_SAVINGS_007
  Scenario: Open both sides of a savings transfer
    Given Emergency Savings starts with "$10,000.00" and Everyday Checking with "$5,000.00" on "2026-09-01"
    And Sam recorded "$500.00" from savings to checking on "2026-09-20"
    When he opens the savings transfer
    Then it shows both account names, "$500.00" and "2026-09-20", with access to the matching checking activity
    And September spending excludes the transfer even when only savings is selected

  @V2_SAVINGS_008
  Scenario: Cancel a savings Balance update after reviewing its difference
    Given savings Balance is "$10,000.00" dated "2026-09-01" with no later activity
    When Sam reviews Update balance to "$12,000.00" dated "2026-09-30"
    Then the review shows a "$2,000.00" increase and asks for a reason
    When he cancels
    Then its one Balance remains "$10,000.00" across list, detail and wealth and no correction is saved

  @V2_SAVINGS_009
  Scenario: Review a savings correction without automatically creating interest
    Given savings starts with "$10,000.00" on "2026-09-01" and received "$2,000.00" on "2026-09-04"
    When Sam reviews Update balance to "$12,025.00" dated "2026-09-30"
    Then he sees current "$12,000.00", requested "$12,025.00" and a "$25.00" increase excluded from Income and spending
    When he confirms with reason "Correct to reviewed account amount"
    Then savings has one Balance "$12,025.00" across list, detail and wealth
    And history shows the initial amount, transfer and correction with Sam, time and reason
    And no Interest income is automatically added

  @V2_SAVINGS_010
  Scenario: Reject a same-account transfer without losing its entered details
    Given savings starts with "$10,000.00" and checking with "$5,000.00" on "2026-09-01" with no activity
    When Sam tries "$500.00" dated "2026-09-20" from savings to savings
    Then he sees "Choose a different account" and his amount and date remain entered
    When he selects checking as destination but cancels
    Then savings Balance remains "$10,000.00", checking "$5,000.00" and no transfer is saved
