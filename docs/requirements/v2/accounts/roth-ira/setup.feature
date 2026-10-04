Feature: Set up and manage Willow Roth IRA
  Maya and Sam share one local household workspace and use USD.
  Balance is cash plus the value of all recorded holdings, with one amount across account views.
  A known zero market price is accepted after review; a missing price remains unavailable.

  @V2_ROTH_IRA_001
  Scenario: Create a complete opening account and edit its descriptive details
    Given the household has members "Maya" and "Sam" and no account named "Willow Roth IRA"
    When Maya adds "Willow Roth IRA" at "Willow Investments" owned by "Maya" dated "2026-09-01"
    And enters an opening total of "$6,000.00", cash "$1,000.00" and 50 "HOME" shares at "$100.00" dated "2026-09-01"
    And leaves the original purchase cost unknown
    Then the opening review shows cash plus holdings equals "$6,000.00" with no unexplained amount
    When Maya saves and opens the account from the list
    Then the list, detail and household wealth use the same Balance "$6,000.00" dated "2026-09-01"
    And purchase cost and gain say "Not available" while the holding value is known
    When Sam edits its name to "Willow Roth IRA Main" and institution to "Willow Investments Services" and saves
    Then both members see the changed details and the same Balance "$6,000.00"
    And the owner remains "Maya" and history identifies Sam as the member who entered the edit

  @V2_ROTH_IRA_002
  Scenario: Complete empty setup by leaving the optional starting amount blank
    Given no account named "Willow Roth IRA" exists
    When Maya adds "Willow Roth IRA" owned by "Maya" with setup date "2026-09-01"
    And leaves the starting amount blank and records no holdings
    And saves the review showing cash "$0.00" and no holdings
    Then the account list and detail show one Balance "$0.00" dated "2026-09-01"
    And the opening history says no starting amount was entered
    And saving does not create a contribution, expense, security price or purchase cost

  @V2_ROTH_IRA_003
  Scenario: Keep an incomplete opening amount as a draft
    Given no account named "Willow Roth IRA" exists
    When Maya starts "Willow Roth IRA" with opening total "$6,000.00" dated "2026-09-01"
    And enters 50 "HOME" shares at "$100.00" but leaves cash unanswered
    Then the review asks for the opening cash amount and does not infer it from the total
    And the incomplete account stays a draft with no Balance added to household wealth
    When Maya cancels the draft
    Then the account list has no new "Willow Roth IRA" account

  @V2_ROTH_IRA_004
  Scenario: Correct cash with a dated explanation and preserve the earlier Balance
    Given "Willow Roth IRA" has cash "$1,000.00" and 50 "HOME" shares at "$100.00" dated "2026-09-01"
    And no financial activity has been recorded after that opening
    When Maya chooses "Update cash position" and enters "$1,200.00" dated "2026-09-30" with reason "Correct cash from September statement"
    Then the review shows a new Balance "$6,200.00" and a cash correction rather than income or a contribution
    When Maya saves the review and reopens the account
    Then the list, detail and wealth use "$6,200.00" dated "2026-09-30"
    And affected performance flags the unexplained cash correction rather than calling it investment earnings
    And history retains the opening Balance "$6,000.00" and the reason, date and member for the correction
    When Sam opens the same correction and cancels an attempted further change
    Then its cash and Balance remain unchanged

  @V2_ROTH_IRA_005
  Scenario Outline: Reject invalid opening components without changing household wealth
    Given today is "2026-10-03" and "Willow Roth IRA" has not been created
    When Maya enters a complete opening dated "2026-09-01" except for <input>
    Then the field explains <message> and the completed account cannot be saved
    And no amount is added to household wealth
    Examples:
      | input | message |
      | cash "-$1.00" | "Cash must be zero or greater" |
      | a holding quantity of 0 | "Enter more than zero shares" |
      | a holding quantity of -2 | "Enter more than zero shares" |
      | a holding price of "-$1.00" | "Holding market price must be zero or greater" |
      | a holding value date "2026-10-04" | "Future values are not completed account history" |
      | a holding value date "2026-08-31" | "Review the earlier tracking start before saving" |

  @V2_ROTH_IRA_006
  Scenario: Review a total that does not match the entered opening components
    Given no account named "Willow Roth IRA" exists
    When Maya enters opening total "$6,000.00" dated "2026-09-01"
    And records cash "$100.00" and 1 "HOME" share priced at "$100.00"
    Then the review shows calculated Balance "$200.00" and the opening amount mismatch
    And Maya must correct the components or the intended opening amount before completing setup
    And no unexplained difference becomes cash

  @V2_ROTH_IRA_007
  Scenario: Keep an individual owner while sharing the account with the household
    Given "Willow Roth IRA" is owned by "Maya" in Maya and Sam's local household workspace
    When Sam opens its owner choices
    Then each choice is one named member and "Maya and Sam" is not an individual-owner choice
    And both household members can view the account without separate sign-ins
    When Maya changes the owner to "Sam" and saves the reviewed correction
    Then its cash, holdings and Balance are unchanged and ownership history retains the previous member
