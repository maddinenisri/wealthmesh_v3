Feature: Track other household assets with simple dated values
  As Maya and Sam
  We want to include assets such as our car without pretending they are cash
  So our wealth overview explains what we own

  @V2_OTHER_ASSET_001
  Scenario: Create, view and edit a car asset
    Given Maya is an active household member
    When she adds Other asset named "Family Car" owned by Maya
    And enters Balance $30,000.00 dated September 1, 2026
    And reviews and confirms
    Then Family Car shows one $30,000.00 Balance in the account list, details and Other assets group
    And Bank money and Investments do not include the car
    When she edits its name to "Blue Car" and changes ownership to Maya and Sam
    And confirms
    Then the new name and joint ownership appear without changing Balance or creating income

  @V2_OTHER_ASSET_002
  Scenario: Start an asset at zero when its initial value is left blank
    Given Sam is adding Other asset named "Collectibles"
    When he leaves Balance blank and reviews and confirms setup dated September 1, 2026
    Then Collectibles shows $0.00 on that date in its list and detail
    And setup is complete and adds $0.00 to household assets

  @V2_OTHER_ASSET_003
  Scenario: Record a lower car estimate and view its effect on wealth
    Given Family Car has a $30,000.00 Balance dated September 1, 2026
    When Sam reviews a $28,000.00 value dated September 30 with reason "Updated resale estimate"
    And confirms
    Then Family Car has one $28,000.00 Balance on September 30
    And wealth shows a $2,000.00 asset value decrease rather than spending
    And September 1 still shows $30,000.00
    And value history retains the earlier estimate, reason and selected member

  @V2_OTHER_ASSET_004
  Scenario Outline: Reject an invalid other-asset amount
    Given Sam is creating Other asset named "Collectibles"
    When he enters Balance <amount> and tries to save
    Then he sees <message> and no asset is created

    Examples:
      | amount | message |
      | -10.00 | Enter zero or a positive asset value |
      | abc | Enter a valid amount |

  @V2_OTHER_ASSET_005
  Scenario: Cancel an asset value change
    Given Family Car has a $30,000.00 Balance
    When Maya reviews changing its value to $28,000.00 and cancels
    Then Balance, household wealth and saved value history remain unchanged

  @V2_OTHER_ASSET_006
  Scenario: Remove a car estimate and undo
    Given Family Car has $30,000.00 dated September 1 and $28,000.00 dated September 30, 2026
    When Maya reviews and confirms removing the September 30 estimate
    Then its effective Balance returns to $30,000.00 with the older date shown
    And the removed estimate remains in history
    When she chooses Undo
    Then one $28,000.00 September 30 estimate is effective again
