Feature: Manage named members in one household workspace
  As Maya and Sam
  We want shared household records with clear owners and entry history
  So we can understand our money together without separate sign-ins

  @V2_MEMBERS_001
  Scenario: Add two people to the same local household
    Given Maya has opened a new local workspace named "Maya and Sam"
    When she adds members named "Maya" and "Sam"
    Then both names are available when choosing an account owner or who entered a record
    And the workspace uses one shared set of accounts and financial records
    And either person using this workspace can review and change those records without an individual sign-in

  @V2_MEMBERS_002
  Scenario: Understand individual and joint account views
    Given joint owners Maya and Sam have checking with a Balance of $5,000.00
    And Sam owns a 401k with $60,000.00 cash and $20,000.00 of holdings
    And Maya owns a Traditional IRA with $20,000.00 cash and $10,000.00 of holdings
    And these are the household's only accounts
    When Maya chooses Sam's accounts
    Then she sees checking once and the 401k once with total assets of $85,000.00
    When she chooses Maya's accounts
    Then she sees checking once and the Traditional IRA once with total assets of $35,000.00
    When she chooses the whole household
    Then she sees each account once with total assets of $115,000.00
    And the view explains that joint checking appears in each person's view and is counted once for the household

  @V2_MEMBERS_003
  Scenario: Record who entered a correction without implying a verified identity
    Given checking has a Balance of $5,000.00 on September 1, 2026
    When Sam chooses his name and reviews a correction to $4,950.00 with reason "Opening amount copied incorrectly"
    And confirms at 10:15 AM on September 2, 2026
    Then the effective Balance is $4,950.00
    And history retains the original amount, correction, reason, selected name "Sam" and time
    And the name is described as the selected household member who entered the record
    And this local annotation is not presented as proof that Sam signed in

  @V2_MEMBERS_004
  Scenario: Remove a member from new choices while preserving existing ownership
    Given Sam owns a 401k with a Balance of $80,000.00
    And Sam is named on its saved contribution and correction history
    When Maya reviews removing Sam from active household members
    Then the review explains that existing ownership and records will remain
    When she confirms
    Then Sam is unavailable for new owner and entered-by choices
    And the 401k remains owned by "Sam, inactive member"
    And its $80,000.00 remains in household assets and Retirement
    And historical entries still show Sam's name
    When Maya restores Sam as an active member
    Then Sam is available for new choices again without duplicate accounts or changed balances

  @V2_MEMBERS_005
  Scenario: Rename a member without changing money or losing attribution
    Given Maya owns checking with a Balance of $5,000.00
    And a saved expense records that Maya entered it
    When Maya reviews renaming her member profile to "Maya Patel"
    And confirms
    Then checking shows owner "Maya Patel" with the same $5,000.00 Balance
    And entry history identifies the same member and retains the earlier name in the profile change history
    And no income, spending or ownership transfer is created

  @V2_MEMBERS_006
  Scenario: Cancel a member removal
    Given Maya and Sam are active members and jointly own checking
    When Maya reviews removing Sam and cancels
    Then both members remain active
    And checking remains jointly owned with unchanged Balance and history
