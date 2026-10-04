Feature: Record investment cash funding and withdrawals as linked household movements
  Cash changes once and investment funding depends on the accounts selected for the view.

  @V2_FUNDING_001
  Scenario: Review cash funding from checking and retain both sides
    Given Everyday Checking starts "2026-09-01" with "$5,000.00"
    And Redwood Brokerage starts that date with cash "$15,000.00" and 50 HOME shares at "$100.00", giving Balance "$20,000.00"
    When Maya records a confirmed "$1,000.00" transfer from checking to brokerage dated "2026-09-15"
    Then the review shows checking "$4,000.00", brokerage cash "$16,000.00" and brokerage Balance "$21,000.00"
    When Maya saves and opens either account's activity
    Then each side links to the same household movement and shows Maya as the member who entered it
    And household wealth is unchanged while brokerage funding increases "$1,000.00"
    And the movement creates no salary income or expense

  @V2_FUNDING_002
  Scenario: Record cash received from outside the household without creating a fictional bank movement
    Given Harbor 401k has cash "$60,000.00" and 200 HOME shares at "$100.00" dated "2026-09-01"
    When Sam records an actual employer contribution "$300.00" dated "2026-09-15" and saves its review
    Then cash is "$60,300.00" and Balance is "$80,300.00"
    And the account explanation shows employer funding "$300.00" rather than earnings
    And no checking withdrawal or take-home salary income is invented

  @V2_FUNDING_003
  Scenario: Withdraw available cash into a household bank account
    Given Willow Roth IRA has cash "$1,000.00" and 50 HOME shares at "$100.00" dated "2026-09-01"
    And Everyday Checking Balance is "$5,000.00" on that date
    When Maya records a past confirmed "$200.00" movement from Roth IRA to checking dated "2026-09-15" and saves
    Then Roth cash is "$800.00", Roth Balance is "$5,800.00" and checking Balance is "$5,200.00"
    And household wealth is unchanged while Roth outgoing funding is "$200.00"
    And the record makes no automatic tax, penalty or withdrawal-eligibility judgment

  @V2_FUNDING_004
  Scenario: Confirm intentional repeated funding rather than save an accidental duplicate
    Given checking Balance is "$5,000.00" and Redwood Brokerage has cash "$15,000.00" plus holdings "$5,000.00" dated "2026-09-01"
    And a "$500.00" checking-to-brokerage transfer is already saved dated "2026-09-15"
    When Maya enters another "$500.00" movement between the same accounts on the same date
    Then the review shows the existing movement and asks whether this is an additional actual transfer
    When Maya chooses "This is another transfer" and saves
    Then checking Balance is "$4,000.00", brokerage cash "$16,000.00" and brokerage Balance "$21,000.00"
    And two separate linked movements are retained with total funding "$1,000.00"
    And reopening the saved review does not create a third transfer

  @V2_FUNDING_005
  Scenario Outline: Reject invalid cash funding or withdrawals without partial changes
    Given today is "2026-10-03", Everyday Checking has "$5,000.00" and Meadow HSA opened "2026-09-01" with cash "$100.00" and no holdings
    When Maya enters <activity>
    Then the review explains <message> and neither account changes
    Examples:
      | activity | message |
      | withdrawal "$101.00" from HSA to checking dated "2026-09-15" | "Only $100.00 cash is available; record a sale or funding first" |
      | contribution "$0.00" into HSA dated "2026-09-15" | "Enter an amount greater than zero" |
      | contribution "-$10.00" into HSA dated "2026-09-15" | "Enter an amount greater than zero" |
      | contribution "$50.00" into HSA dated "2026-10-04" | "Save a future reminder instead of completed activity" |
      | contribution "$50.00" into HSA dated "2026-08-31" | "Review the earlier tracking start before saving" |
