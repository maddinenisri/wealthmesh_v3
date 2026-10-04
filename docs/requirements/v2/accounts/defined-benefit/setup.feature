Feature: Manage a defined benefit cash balance value
  A plan-reported benefit value is one Balance, separate from personal cash and securities.

  @V2_DB_001
  Scenario: Create a plan value and edit the descriptive details
    Given Maya and Sam have no "Harbor Cash Balance" account
    When Sam adds "Harbor Cash Balance" at "Harbor Benefits" owned by "Sam"
    And enters plan-reported Balance "$40,000.00" dated "2026-09-01" and saves
    Then the list, detail and household wealth use the same "$40,000.00" Balance
    And the detail labels it "Plan-reported benefit value" and asks for no personal cash or holdings
    When Maya edits the name to "Harbor Cash Balance Main" and institution to "Harbor Benefits Services" and saves
    Then both household members see the changed details and unchanged Balance and individual participant "Sam"

  @V2_DB_002
  Scenario: Save a blank initial value without changing a pension promise
    Given Sam has a separate stated pension promise of "$2,000.00" per month
    When Sam creates "Harbor Cash Balance" with starting amount blank dated "2026-09-01" and saves
    Then its one tracked Balance starts at "$0.00" with a note that no starting amount was entered
    And that zero does not say the pension promise is zero
    And the monthly promise is not multiplied into household assets

  @V2_DB_003
  Scenario: Record pay and interest credits separately
    Given Harbor Cash Balance has plan-reported value "$40,000.00" dated "2026-09-01"
    When Sam records a plan statement dated "2026-09-30" with pay credit "$1,000.00" and interest credit "$200.00"
    And reviews and saves the resulting plan Balance "$41,200.00"
    Then household wealth uses "$41,200.00" and retirement value includes it once
    And its explanation separates the "$1,000.00" pay credit from "$200.00" benefit interest
    And no bank salary, personal cash holding or securities purchase is created
    And the September 1 value remains available in history

  @V2_DB_004
  Scenario: Correct a plan statement with review and cancellation
    Given Harbor Cash Balance has "$40,000.00" dated "2026-09-01" and "$41,200.00" dated "2026-09-30"
    When Maya corrects the September 30 statement to "$41,100.00" with reason "Corrected statement"
    Then the review shows the "$100.00" reduction and the affected household and retirement totals
    When Maya cancels
    Then the Balance remains "$41,200.00"
    When Maya repeats and saves the correction
    Then the Balance becomes "$41,100.00" and history retains the original and correction with their reasons and members

  @V2_DB_005
  Scenario Outline: Reject an invalid completed plan value
    Given today is "2026-10-03" and Harbor Cash Balance starts tracking on "2026-09-01"
    When Sam enters <entry> as a completed plan value
    Then the form explains <message> and no new Balance is saved
    Examples:
      | entry | message |
      | "-$100.00" dated "2026-09-30" | "Plan value must be zero or greater" |
      | "$40,000.00" dated "2026-10-04" | "Future values are not completed account history" |
      | "$40,000.00" dated "2026-08-31" | "Review the earlier tracking start before saving" |

  @V2_DB_006
  Scenario: Preserve individual participation and a nonzero archived value
    Given Harbor Cash Balance is owned by Sam with plan-reported Balance "$40,000.00"
    When Maya opens owner choices
    Then she can choose one member and cannot choose joint participation "Maya and Sam"
    When Sam archives the account after reviewing its nonzero value
    Then it leaves the everyday active list but remains in household wealth and retirement value at "$40,000.00"
    And its owner and plan statements remain available in history
