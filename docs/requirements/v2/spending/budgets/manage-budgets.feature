Feature: Make and review a household Budget for each month
  A monthly total and category targets help Maya and Sam prepare for future expenses.
  Editing or copying a Budget changes neither paid expenses nor money in accounts.
  The examples use USD and each starts with its own described Budget and spending.

  @V2_BUDGET_001
  Scenario: Build a September Budget and compare it with spending
    Given September has no saved Budget
    And September spending is Rent "$1,500.00", Utilities "$180.00", Insurance "$700.00", Groceries "$600.00", Dining "$380.00" and Travel "$300.00"
    When Maya enters a September total of "$3,600.00"
    And she sets targets Rent "$1,500.00", Utilities "$180.00", Insurance "$700.00", Groceries "$600.00", Dining "$350.00" and Travel "$270.00"
    Then the review shows category targets totaling "$3,600.00" and the September month
    When she confirms saving the Budget
    Then September shows spending "$3,660.00" and "$60.00 over Budget"
    And Dining shows "$30.00 over target" and Travel shows "$30.00 over target"
    And opening either category shows the expenses behind its spending

  @V2_BUDGET_002
  Scenario: Explain a gap between the total Budget and category targets
    Given September's total Budget is "$3,600.00"
    And its targets are Rent "$1,500.00", Utilities "$180.00", Insurance "$700.00", Groceries "$600.00" and Dining "$350.00", with no Travel target
    And September has Travel spending of "$300.00"
    When Sam reviews the Budget
    Then category targets total "$3,330.00" and "$270.00" of the total Budget has no category target
    And Travel spending remains included and is labeled "No target set"
    When he adds a Travel target of "$270.00" and confirms saving
    Then category targets total "$3,600.00" and Travel shows "$30.00 over target"
    And the existing "$300.00" Travel expense has not changed

  @V2_BUDGET_003
  Scenario: Review a target change without quietly changing the total Budget
    Given September's total and category targets both total "$3,600.00", including Groceries "$600.00"
    And September has Groceries spending "$600.00"
    When Maya changes the Groceries target to "$650.00"
    Then the review shows category targets "$3,650.00", the total Budget "$3,600.00" and a "$50.00" difference
    When she cancels
    Then the saved Groceries target remains "$600.00" and the total Budget remains "$3,600.00"
    When she again sets Groceries to "$650.00", changes the total Budget to "$3,650.00" and confirms saving
    Then the Budget and category totals agree at "$3,650.00"
    And Groceries has "$50.00 left to target" while its actual spending remains "$600.00"

  @V2_BUDGET_004
  Scenario: Copy targets into a new month without copying expenses
    Given September's Budget is "$3,600.00" with targets Rent "$1,500.00", Utilities "$180.00", Insurance "$700.00", Groceries "$600.00", Dining "$350.00" and Travel "$270.00"
    And September has recorded spending "$3,660.00" while October has no Budget and no recorded expenses
    When Sam selects October
    Then he sees "No Budget for October" and can create one or copy an earlier month's Budget
    When he chooses Copy September Budget, reviews October and confirms saving
    Then October has the "$3,600.00" total and the same six category targets
    And October still has no recorded expenses and its recorded spending is "$0.00"
    And September's Budget and "$3,660.00" spending remain unchanged

  @V2_BUDGET_005
  Scenario Outline: Explain a zero category target without a misleading percentage
    Given September has a saved "<category>" target of "$0.00" and recorded spending "<spending>" in that category
    When Maya opens the category's September budget review
    Then its target is "$0.00", spending is "<spending>" and the status is "<status>"
    And the percentage used is shown as "Not applicable" because the target is zero
    And opening spending shows "<detail>"

    Examples:
      | category | spending | status | detail |
      | Subscriptions | $50.00 | $50.00 unplanned spending | the recorded $50.00 subscription expense |
      | Entertainment | $0.00 | No spending | no recorded expenses |

  @V2_BUDGET_006
  Scenario: Remove and undo a monthly Budget without removing actual spending
    Given September has Budget "$3,600.00" with saved category targets and actual spending "$3,660.00"
    When Maya reviews removing September's Budget but cancels
    Then the Budget and "$60.00 over Budget" status remain
    When she reviews again and confirms removal
    Then September says "No Budget for September" and actual spending remains "$3,660.00"
    And the removed Budget remains in history with Undo
    When she confirms Undo
    Then the "$3,600.00" Budget and its original category targets return and spending is still "$3,660.00"

  @V2_BUDGET_007
  Scenario: Reject a negative category target and cancel the correction
    Given September's saved Groceries target is "$600.00" and actual Groceries spending "$125.00"
    When Sam enters a target "-$50.00" and tries to save
    Then the target says "Enter zero or a positive amount" and the saved target remains "$600.00"
    When he enters "$650.00" but cancels
    Then the target is still "$600.00" and the actual expense stays "$125.00"
