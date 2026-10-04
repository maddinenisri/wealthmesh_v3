Feature: Set up a household's finances
  As Maya and Sam
  We want to add the accounts we use and the balances we know
  So we can begin understanding our money without completing every detail at once

  @V2_HOUSEHOLD_SETUP_001
  Scenario: Add the people who own the household's accounts
    Given Maya is starting a household named "Maya and Sam"
    When she adds herself and Sam as household members
    And she creates "Everyday Checking" with a starting balance of $5,000.00 on September 1, 2026
    And she identifies Maya and Sam as the account's owners
    Then both names appear on the account details
    And the household has one "Everyday Checking" account with a balance of $5,000.00
    And the shared account contributes $5,000.00 once to household wealth
    When Maya changes the household name to "Our Household"
    Then the account still has the same owners and balance

  @V2_HOUSEHOLD_SETUP_002
  Scenario: Add known balances for the household's different account types
    Given today is September 1, 2026
    And Maya and Sam have no accounts in their household
    When Maya creates checking account "Everyday Checking" with a starting balance of $5,000.00
    And she creates savings account "Emergency Savings" with a starting balance of $10,000.00
    And she creates credit card "Everyday Credit Card" with a starting amount owed of $1,000.00
    And she creates "Redwood Brokerage" with $15,000.00 cash and 50 HOME shares priced at $100.00
    And Sam creates "Harbor 401k" with $60,000.00 cash and 200 HOME shares priced at $100.00
    And Maya creates "Willow Traditional IRA" with $20,000.00 cash and 100 HOME shares priced at $100.00
    And Sam creates defined benefit account "Harbor Cash Balance" with a starting cash value of $40,000.00
    Then the account list shows all seven accounts with their account types
    And the investment accounts have one Balance each: $20,000.00, $80,000.00 and $30,000.00
    And each starting amount is dated September 1, 2026
    And the household owns $185,000.00 in financial assets and owes $1,000.00
    And its net worth is $184,000.00
    And entering these balances does not count as salary, spending or investment growth

  @V2_HOUSEHOLD_SETUP_003
  Scenario: Start with an empty household and choose the first account to add
    Given Maya has created her household but has not added any accounts
    When she opens the household overview
    Then she sees that no accounts have been added
    And she sees $0.00 in financial assets and $0.00 in debts for the empty household
    And she can choose "Add account"
    When she chooses checking and names the account "Everyday Checking"
    And she leaves the optional starting balance blank and saves
    Then the account appears with a starting balance of $0.00
    And she can open the account and add her first transaction

  @V2_HOUSEHOLD_SETUP_004
  Scenario: Use today's date or choose the date of a known starting balance
    Given today is September 5, 2026
    And Maya is adding "Emergency Savings"
    When she enters a starting balance of $10,000.00
    Then the balance date initially shows September 5, 2026
    When she changes the date to September 1, 2026 and saves
    Then the account details show a starting balance of $10,000.00 on September 1, 2026
    And the saved balance does not appear as $10,000.00 of September income

  @V2_HOUSEHOLD_SETUP_005
  Scenario: Find a personal retirement account from the household account list
    Given Maya owns "Willow Traditional IRA" with $20,000.00 cash and $10,000.00 of holdings
    And Sam owns "Harbor 401k" with $60,000.00 cash and $20,000.00 of holdings
    When Maya views the household's retirement accounts
    Then she sees both accounts and their owners
    And the retirement account total is $110,000.00
    When she opens Sam's "Harbor 401k"
    Then the details show Sam as the owner and a balance of $80,000.00
    And viewing the same account from different lists does not create another account
