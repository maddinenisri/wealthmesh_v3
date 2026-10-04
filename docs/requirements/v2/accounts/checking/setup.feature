Feature: Set up a checking account and keep its details clear
  Maya and Sam manage their household in USD.
  Balance is optional when adding a new account: leaving it blank starts at $0.00 on the setup date.
  Editing the account name, owner or bank is separate from Update balance, which asks for an amount and date.
  Each example starts with only the accounts and activity it describes.

  @V2_CHECKING_001
  Scenario: Create checking with a known initial Balance and find it again
    Given Maya has no checking account in the household
    When Maya adds "Everyday Checking" at "Harbor Bank", owned by Maya, on "2026-09-01"
    And she enters Balance "$5,000.00" and saves
    Then the account list shows Everyday Checking, Maya, Harbor Bank and "$5,000.00" dated "2026-09-01"
    When she opens Everyday Checking from the list
    Then its detail shows the same name, owner, bank and initial Balance
    And its activity is empty with an action to add money in, money out or a transfer
    And the starting amount is not counted as September income

  @V2_CHECKING_002
  Scenario Outline: Start new checking at zero when an opening amount is not needed
    Given Maya is adding Everyday Checking on "2026-09-01"
    When she chooses "<choice>" for Balance and saves
    Then the account list and detail show "$0.00" starting on "2026-09-01"
    And the detail makes clear that no money activity has been recorded yet
    When she records salary "$6,000.00" received on "2026-09-02"
    Then the Balance is "$6,000.00" and September income is "$6,000.00"

    Examples:
      | choice                        |
      | leave Balance blank  |
      | enter Balance $0.00  |

  @V2_CHECKING_003
  Scenario: Edit account details without changing money
    Given Everyday Checking belongs to Sam at Harbor Bank with initial Balance "$5,000.00" dated "2026-09-01" and no activity
    When Maya opens Edit account, changes the name to "Household Checking", changes the owner to Maya and changes the bank to "Harbor Credit Union"
    And she saves the account details
    Then the list and detail show Household Checking, Maya and Harbor Credit Union
    And its initial Balance remains "$5,000.00" dated "2026-09-01"
    And Edit account does not include changing the balance
    And a separate Update balance action asks for an amount and date

  @V2_CHECKING_004
  Scenario: Cancel account-detail changes
    Given Everyday Checking belongs to Maya at Harbor Bank with initial Balance "$5,000.00" dated "2026-09-01"
    When Maya changes its name to Household Checking and owner to Sam but cancels
    Then the list and detail still show Everyday Checking owned by Maya at Harbor Bank
    And its balance and date remain "$5,000.00" and "2026-09-01"

  @V2_CHECKING_005
  Scenario: Explain an incomplete setup and allow cancellation
    Given Maya has no checking account in the household
    When she enters Harbor Bank and Balance "$5,000.00" for "2026-09-01" but leaves the account name blank and tries to save
    Then Name says "Enter an account name" and her bank, amount and date remain entered
    And no checking account appears in the account list
    When she fills in Everyday Checking but cancels
    Then the household still has no checking account

  @V2_CHECKING_006
  Scenario: Supply missing starting information without inventing history
    Given Maya has opened a household file saved by an older application version
    And Everyday Checking already has a "$100.00" Groceries expense on "2026-09-10" but its initial amount is unknown
    And Maya has a September 30 statement showing "$5,000.00" as optional supporting information
    When Maya opens checking
    Then its only Balance field says "Starting balance needed" and the existing expense remains visible
    And the September 30 statement does not establish the amount held on September 1
    When she independently reviews an initial Balance "$5,000.00" at the start of "2026-09-01", before the first expense
    Then the review shows checking will have Balance "$4,900.00" and September spending "$100.00"
    And it asks her to review the "$100.00" difference from her statement rather than silently creating income
    When she confirms the starting information
    Then checking Balance is "$4,900.00" in its list, detail and household wealth
    And the expense and supporting statement remain available

  @V2_CHECKING_017
  Scenario: Keep an invalid initial Balance as an unsaved form
    Given Maya is adding Everyday Checking on "2026-09-01"
    When she types "five thousand" in Balance and tries to save
    Then Balance says "Enter a valid amount" and her account details and date remain entered
    When she replaces it with "$5,000.00" and saves
    Then the list and detail show the same Balance "$5,000.00" dated "2026-09-01"
