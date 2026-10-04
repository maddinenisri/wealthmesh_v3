Feature: Track a home's value as a household asset
  As Maya and Sam
  We want a simple dated value for our home
  So overall wealth includes the home and shows its mortgage separately

  @V2_PROPERTY_001
  Scenario: Create, view and edit a jointly owned home
    Given Maya and Sam have one local household workspace
    When Maya chooses Add account and Property
    And enters name "Family Home", owners Maya and Sam, Balance $300,000.00 and date September 1, 2026
    And reviews and confirms
    Then Family Home shows one Balance of $300,000.00 dated September 1 in the account list and details
    And Property assets include $300,000.00 once for the household
    When she edits the name to "Maple Street Home" and confirms
    Then the new name appears with the same owners, Balance and value date
    And a mortgage is recorded as its own debt rather than subtracted from the home's Balance

  @V2_PROPERTY_002
  Scenario: Leave the optional initial property value blank
    Given Sam is setting up a property named "Land"
    When he leaves Balance blank and reviews setup dated September 1, 2026
    Then the review explains that Land will start at $0.00 on that date
    When he confirms
    Then Land has one Balance of $0.00 and adds $0.00 to wealth
    And saving completes the setup without a separate zero-confirmation action

  @V2_PROPERTY_003
  Scenario: Record a new property estimate and correct it with history
    Given Family Home has a $300,000.00 Balance dated September 1, 2026
    When Maya enters a new estimated value of $320,000.00 dated September 30, 2026
    And reviews and confirms with reason "September estimate"
    Then its September 30 Balance is $320,000.00
    And the wealth explanation identifies the $20,000.00 property value increase rather than income
    When she reviews correcting that estimate to $315,000.00 with reason "Copied the wrong estimate"
    And confirms
    Then the effective September 30 Balance is $315,000.00 everywhere
    And history retains the $300,000.00 opening value and the original and corrected September estimates
    And September 1 wealth still uses $300,000.00

  @V2_PROPERTY_004
  Scenario Outline: Reject an invalid initial property amount
    Given Maya is creating Family Home
    When she enters Balance <amount> and tries to save
    Then she sees <message> and no property account is created

    Examples:
      | amount | message |
      | -1.00 | Enter zero or a positive property value |
      | abc | Enter a valid amount |

  @V2_PROPERTY_005
  Scenario: Remove an estimate and restore the earlier effective value
    Given Family Home has an opening value of $300,000.00 on September 1
    And a saved estimate of $320,000.00 on September 30, 2026
    When Sam reviews removing the September 30 estimate
    Then he sees that the latest effective Balance will return to $300,000.00 with its September 1 date
    When he confirms
    Then household wealth uses $300,000.00 and flags the older value date
    And the removed estimate stays in history
    When he chooses Undo twice
    Then one effective September 30 estimate returns and Balance is $320,000.00

  @V2_PROPERTY_006
  Scenario: Keep a future estimate as a plan rather than today's value
    Given today is October 3, 2026 and Family Home has a $300,000.00 Balance
    When Maya enters a $330,000.00 estimate dated December 31, 2026
    Then she is guided to save a future plan or choose a date on or before today
    And today's Balance and wealth remain unchanged
