Feature: Organize spending and income categories
  As Maya and Sam
  We want useful names and consistent spending choices
  So monthly totals remain understandable as our household changes

  @V2_CATEGORIES_001
  Scenario: Create a spending category with a default and override one expense
    Given checking has a Balance of $5,000.00
    When Maya creates "Groceries" with the default Essential
    And records a $90.00 grocery expense using that default
    And records a $30.00 grocery expense explicitly marked Discretionary for party treats
    Then checking has a Balance of $4,880.00
    And Groceries spending is $120.00
    And Essential spending is $90.00 and Discretionary spending is $30.00
    And each expense shows its own chosen classification

  @V2_CATEGORIES_002
  Scenario: Change a category default while keeping past choices
    Given "Dining" has the default Discretionary
    And September includes a saved $50.00 Dining expense marked Discretionary
    And checking's Balance is $4,950.00 after that expense
    When Sam reviews and changes Dining's default to Essential
    Then the September expense remains Discretionary
    And changing the default leaves checking's $4,950.00 Balance and saved amounts unchanged
    When he records an October $20.00 Dining expense using the new default
    Then that October expense is Essential
    And the new $20.00 expense lowers checking's Balance to $4,930.00
    And the earlier expense's amount and classification remain unchanged

  @V2_CATEGORIES_003
  Scenario: Rename a category and follow its history
    Given September contains $125.00 of expenses in "Food shopping"
    When Maya reviews renaming the category to "Groceries"
    And confirms
    Then September shows $125.00 in Groceries with the same linked expenses
    And account balances and total spending are unchanged
    And category history records the earlier name "Food shopping"
  @V2_CATEGORIES_004
  Scenario: Merge two categories and undo without duplicating spending
    Given September contains $50.00 in Dining and $75.00 in Restaurants
    And the saved expenses retain their Essential or Discretionary choices
    When Sam reviews merging both categories into "Eating out"
    Then the review shows two expenses totaling $125.00
    When he confirms
    Then Eating out shows $125.00 and opens the same two expenses
    And their classifications and account balances are unchanged
    When he chooses Undo
    Then Dining again shows $50.00 and Restaurants shows $75.00
    And September spending remains $125.00 without duplicate expenses

  @V2_CATEGORIES_005
  Scenario: Archive a category while retaining its saved entries
    Given September contains $300.00 of Travel expenses
    When Maya reviews and confirms archiving Travel
    Then Travel is unavailable for new expense choices
    And September still shows its $300.00 with an archived category label and linked records
    When she restores Travel
    Then it is available for new expenses without changing old spending or balances

  @V2_CATEGORIES_006
  Scenario: Include uncategorized spending and resolve its review flag
    Given checking has $5,000.00
    When Sam records a $125.00 expense without choosing a category
    Then checking has $4,875.00 and September spending includes $125.00
    And the expense appears under Uncategorized with a category review flag
    And its unclassified $125.00 is shown separately from Essential and Discretionary totals
    When he reviews and assigns Groceries with Essential
    Then Groceries and Essential spending include $125.00
    And the review flag clears without changing checking's $4,875.00 or total spending

  @V2_CATEGORIES_007
  Scenario: Create an income category without an Essential choice
    Given Maya has no income category named "Side work"
    And checking has a Balance of $5,000.00
    When she creates the income category "Side work"
    And records $200.00 into checking using it
    Then income by category shows $200.00 in Side work
    And the income category has no Essential or Discretionary spending classification
    And editing its name does not turn the income into spending

  @V2_CATEGORIES_008
  Scenario: Reject an empty or duplicate category name
    Given an active spending category named "Groceries" exists
    When Maya tries to save a category with a blank name
    Then she sees "Enter a category name" and no category is created
    When she tries to create another spending category named "Groceries"
    Then she is guided to the existing category instead of creating an indistinguishable duplicate
