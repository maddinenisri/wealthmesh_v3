Feature: Review dates and corrections for manually valued assets and debts
  As Maya and Sam
  We want dates and original records preserved when a value changes
  So past wealth can be explained without turning estimates into transactions

  @V2_DATED_VALUE_001
  Scenario Outline: Require a current or past date for a recorded value
    Given today is October 3, 2026
    And <account> has a saved Balance of <current>
    When Maya proposes a value dated December 31, 2026
    Then she can save a future plan or choose a date on or before today
    And the account's current Balance remains <current>
    And today's wealth and saved value history remain unchanged

    Examples:
      | account | current |
      | Family Home | $300,000.00 |
      | Family Car | $30,000.00 |
      | Car Loan | $20,000.00 owed |
      | Home Mortgage | $200,000.00 owed |

  @V2_DATED_VALUE_002
  Scenario: Review a value before the account's tracking start
    Given Family Car began tracking at $30,000.00 on September 1, 2026
    And its September 30 value is $28,000.00
    When Sam proposes $31,000.00 dated August 1, 2026
    Then he is guided to review extending the account's history
    And the review shows an August opening of $31,000.00, September 1 value of $30,000.00 and September 30 value of $28,000.00
    When he cancels
    Then the tracking start and both saved values remain unchanged
    When he reviews again and confirms with reason "Add an earlier car estimate"
    Then August wealth uses $31,000.00 for the car
    And September 1 and September 30 values remain $30,000.00 and $28,000.00
    And no income, spending or cash transfer is created

  @V2_DATED_VALUE_003
  Scenario: Remove and restore a loan correction
    Given Car Loan has an opening $20,000.00 owed on September 1, 2026
    And a reviewed September 30 correction changed debt to $19,800.00 without a payment
    When Maya reviews and confirms removing the September 30 correction
    Then the latest effective Balance returns to $20,000.00 owed with its September 1 date
    And the removed correction and reason remain in history
    And no cash or spending changes
    When she chooses Undo twice
    Then one effective correction returns and Balance is $19,800.00 owed

  @V2_DATED_VALUE_004
  Scenario: Prevent repeated confirmation from saving duplicate estimates
    Given Family Car has $30,000.00 dated September 1, 2026
    When Sam reviews a $28,000.00 estimate dated September 30
    And presses Confirm twice while saving
    Then there is one new effective estimate in history
    And September 30 Balance is $28,000.00 everywhere
    And the wealth change from that estimate is negative $2,000.00 once
