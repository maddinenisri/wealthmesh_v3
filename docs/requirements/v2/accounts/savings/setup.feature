Feature: Add savings with an optional initial Balance
  Maya and Sam use savings for their emergency fund in USD.
  A new account starts at $0.00 on its setup date when Balance is left blank.
  Accounts from older household files with missing starting information need reviewed setup instead.

  @V2_SAVINGS_001
  Scenario: Add savings and follow it from the list to its detail
    Given Sam has no savings account in the household
    When he adds "Emergency Savings" at "Harbor Bank", owned by Sam, on "2026-09-01"
    And he enters Balance "$10,000.00" and saves
    Then the account list shows Emergency Savings, Sam, Harbor Bank and "$10,000.00" dated "2026-09-01"
    When he opens Emergency Savings
    Then the detail shows the same starting amount and an empty activity list
    And he can choose money in, money out, transfer, Edit account or Update balance
    And the starting amount is not counted as income

  @V2_SAVINGS_002
  Scenario Outline: Start savings at zero and add money later
    Given Sam is adding Emergency Savings on "2026-09-01"
    And Everyday Checking has "$5,000.00" starting on "2026-09-01"
    When he chooses "<choice>" for Balance and saves
    Then the savings list and detail show "$0.00" starting on "2026-09-01"
    When Sam confirms moving "$2,000.00" from checking to savings on "2026-09-04"
    Then savings shows "$2,000.00" and checking shows "$3,000.00"
    And the move adds neither income nor spending to the household

    Examples:
      | choice                       |
      | leave Balance blank |
      | enter Balance $0.00 |

  @V2_SAVINGS_003
  Scenario: Rename savings and correct its owner and bank separately from its balance
    Given Emergency Savings belongs to Maya at Harbor Bank with "$10,000.00" starting on "2026-09-01"
    When Sam uses Edit account to rename it "Household Emergency Fund", select Sam as owner and change the bank to "Harbor Credit Union"
    And he saves the details
    Then the list and detail show Household Emergency Fund owned by Sam at Harbor Credit Union
    And the balance remains "$10,000.00" dated "2026-09-01"
    And changing money requires the separate Update balance action with amount and date

  @V2_SAVINGS_004
  Scenario: Cancel an account edit without losing the existing savings account
    Given Emergency Savings belongs to Sam with "$10,000.00" starting on "2026-09-01"
    When Sam changes the name to Holiday Savings but cancels
    Then the list still shows Emergency Savings owned by Sam with "$10,000.00"
    And reopening the detail shows the original name and date

  @V2_SAVINGS_005
  Scenario: Keep an incomplete existing account unknown until reviewed setup
    Given Sam has opened a household file saved by an older application version
    And Emergency Savings already received a "$2,000.00" transfer on "2026-09-04" but its initial amount is unknown
    And Sam has a September 30 statement showing "$12,000.00" as optional supporting information
    When Sam opens savings
    Then its only Balance field says "Starting balance needed" and the transfer remains visible
    And the September 30 statement does not establish the amount held on September 1
    When he independently reviews initial Balance "$10,000.00" at the start of "2026-09-01"
    Then the review shows Balance will become "$12,000.00" without changing the transfer
    When he cancels
    Then Balance still says "Starting balance needed" and neither the transfer nor the statement is removed

  @V2_SAVINGS_011
  Scenario: Explain an invalid Balance while preserving setup details
    Given Sam is adding Emergency Savings on "2026-09-01"
    When he enters "ten thousand" in Balance and tries to save
    Then Balance says "Enter a valid amount" and his name, bank and date remain entered
    When he enters "$10,000.00" but cancels
    Then no savings account is added
