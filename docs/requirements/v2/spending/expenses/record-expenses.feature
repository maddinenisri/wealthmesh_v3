Feature: Record expenses efficiently while choosing each date and account
  Maya and Sam can record one expense, save and add another, or review several entries together.
  Money in a draft is not spending until they confirm saving it.
  Each independent example uses USD and begins with only its stated accounts and activity.

  @V2_EXPENSE_001
  Scenario: Record a bill and inspect it from monthly spending
    Given Everyday Checking starts at "$5,000.00" on "2026-09-01" with no activity
    When Maya records "Electricity" for "$180.00" paid from checking on "2026-09-05" in Utilities
    And she confirms saving
    Then checking Balance is "$4,820.00"
    When she opens September Spending and selects Utilities
    Then she sees Electricity for "$180.00" dated "2026-09-05" paid from Everyday Checking
    And opening that expense shows its account, date, amount and category

  @V2_EXPENSE_002
  Scenario: Save and add another with a visible date and account
    Given Everyday Credit Card starts at "$0.00 owed" on "2026-09-01" with no purchases
    When Sam saves a "$150.00" Groceries purchase dated "2026-09-06" using Save and add another
    Then the next form clearly shows the retained card and Groceries category and asks him to confirm the next date and amount
    When he enters "$150.00" dated "2026-09-13" and confirms saving
    Then September Groceries spending is "$300.00" with two separately inspectable purchases on their own dates
    And the card Balance is "$300.00 owed"

  @V2_EXPENSE_003
  Scenario: Review and save four weekly expenses together
    Given Everyday Credit Card starts at "$0.00 owed" on "2026-09-01" with no purchases
    When Sam prepares four supermarket purchases of "$150.00" each in Groceries dated "2026-09-06", "2026-09-13", "2026-09-20" and "2026-09-27"
    Then the review shows every date, the card, each "$150.00" amount and the total "$600.00"
    And none of these purchases appears in saved activity yet
    When he confirms saving the reviewed entries
    And the same save is repeated after a slow response
    Then exactly four separate purchases appear on those dates and September Groceries spending is "$600.00"
    And the card Balance is "$600.00 owed"

  @V2_EXPENSE_004
  Scenario: Cancel several prepared expenses without changing the month
    Given Everyday Checking starts at "$5,000.00" on "2026-09-01" with no expenses
    When Maya prepares Utilities "$180.00" dated "2026-09-05" and Insurance "$700.00" dated "2026-09-08"
    And she reviews the "$880.00" total but cancels
    Then checking remains "$5,000.00"
    And September has neither prepared expense and spending remains "$0.00"

  @V2_EXPENSE_005
  Scenario: Save none of a group when one amount is invalid
    Given Everyday Credit Card starts at "$0.00 owed" on "2026-09-01" with no purchases
    When Sam prepares a "$150.00" grocery purchase on "2026-09-06" and an invalid "-$100.00" purchase on "2026-09-13"
    And he tries to save both together
    Then the second purchase says "Enter an amount greater than zero"
    And neither purchase is saved and the card still shows "$0.00 owed"
    And the valid first purchase, accounts and dates remain entered so he can correct the group

  @V2_EXPENSE_006
  Scenario: Correct a purchase category without changing the money spent
    Given Everyday Checking started at "$5,000.00" on "2026-09-01" and has one "$125.00" supermarket expense dated "2026-09-10" mistakenly categorized as Dining
    When Maya opens the expense, changes its category to Groceries and reviews the correction
    Then the review keeps Everyday Checking, "$125.00" and "2026-09-10" while showing Dining changed to Groceries
    When she confirms saving the correction
    Then September Groceries spending is "$125.00" and Dining spending is "$0.00"
    And total spending stays "$125.00" and checking stays "$4,875.00"
    And the original expense is shown once with its corrected category, same account, amount and date

  @V2_EXPENSE_007
  Scenario: Change the payment account and date with both months reviewed
    Given today is "2026-10-03"
    And checking starts with "$5,000.00" and savings with "$10,000.00" on "2026-09-01"
    And their only activity is Rent "$1,500.00" recorded from checking on "2026-09-03"
    When Maya reviews changing that expense to savings paid on "2026-10-02"
    Then she sees checking Balance "$5,000.00", savings "$8,500.00", September spending "$0.00" and October spending "$1,500.00"
    When she confirms with reason "Correct payment account and date"
    Then both Balances and month totals match the review and the expense appears once with its corrected details
    And its history retains the original account, date, Maya, time and reason

  @V2_EXPENSE_008
  Scenario: Correct an expense that was actually a household transfer
    Given checking starts with "$5,000.00" and savings with "$10,000.00" on "2026-09-01"
    And Maya mistakenly recorded "$2,000.00" from checking on "2026-09-04" as Other spending instead of the transfer she actually made to savings
    When she chooses Change to transfer, selects savings as destination and reviews
    Then the preview shows checking Balance "$3,000.00", savings "$12,000.00" and September spending "$0.00"
    When she confirms with reason "This money moved to our savings"
    Then the one effective action is a transfer visible from both accounts, excluded from Income and spending
    And the previous expense classification remains in correction history

  @V2_EXPENSE_009
  Scenario: Remove an incorrect expense and restore it with Undo
    Given checking starts with "$5,000.00" on "2026-09-01" and its only activity is Groceries "$125.00" dated "2026-09-10"
    When Sam reviews removing that expense but cancels
    Then Balance remains "$4,875.00" and September Groceries spending "$125.00"
    When he reviews again and confirms removal
    Then Balance is "$5,000.00" and September spending "$0.00" with the saved removal still reviewable
    And the review explains removing a tracked expense does not obtain a merchant refund
    When he confirms Undo
    Then Balance is "$4,875.00" and Groceries spending "$125.00" with one effective expense on its original date

  @V2_EXPENSE_010
  Scenario: Reject a zero purchase rather than silently recording it
    Given checking Balance starts at "$5,000.00" on "2026-09-01" with no activity
    When Maya tries to record Groceries "$0.00" dated "2026-09-10"
    Then Amount says "Enter an amount greater than zero" and her account, date and category remain entered
    And Balance is still "$5,000.00" with no expense

  @V2_EXPENSE_011
  Scenario: Treat a future bill as a reminder rather than completed spending
    Given today is "2026-09-10" and checking Balance is "$5,000.00" with no expenses
    When Sam enters Utilities "$180.00" paid on the future date "2026-09-30"
    Then the form explains future activity is a plan or reminder and offers Save reminder
    When he saves the reminder
    Then Balance remains "$5,000.00" and September actual spending remains "$0.00"
    And the dated "$180.00" bill appears among reminders, awaiting a separately confirmed actual expense
