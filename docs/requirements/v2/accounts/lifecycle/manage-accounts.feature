Feature: Archive, close and remove accounts without losing household money
  As Maya and Sam
  We want to tidy the account list and preserve records we still rely on
  So hiding an account never makes assets or debts disappear

  @V2_ACCOUNT_LIFECYCLE_001
  Scenario: Archive an account that still holds money
    Given the household has checking with $5,000.00 and savings with $10,000.00
    And these are its only accounts
    When Maya reviews archiving savings
    Then the review explains that its $10,000.00 will remain in wealth
    When she confirms
    Then savings is hidden from the active account list
    And household assets remain $15,000.00
    And Bank money includes the archived savings account with a visible archived label
    When Maya opens archived accounts and restores savings
    Then it returns to the active list with the same Balance and complete history

  @V2_ACCOUNT_LIFECYCLE_002
  Scenario: Archive a card without hiding debt
    Given checking has $5,000.00 and a credit card has $1,000.00 owed
    And these are the household's only accounts
    When Sam archives the card after reviewing its debt
    Then household assets remain $5,000.00 and debt remains $1,000.00
    And net worth remains $4,000.00
    And the archived card is available from the debt total and its payment history

  @V2_ACCOUNT_LIFECYCLE_003
  Scenario: Close savings after moving its remaining money
    Given checking has $5,000.00 and savings has $1,000.00
    When Maya chooses Close account for savings
    Then she sees that closing requires a zero Balance and the existing $1,000.00 must be accounted for
    When she records and confirms a $1,000.00 transfer from savings to checking
    And reviews and confirms closing savings
    Then savings is marked closed with a zero Balance and retained history
    And checking has $6,000.00
    And household wealth remains $6,000.00 with no income or spending from the transfer
    And closed savings is unavailable for new entries until Maya explicitly reopens it

  @V2_ACCOUNT_LIFECYCLE_004
  Scenario: Close a paid-off credit card
    Given checking has $5,000.00 and a credit card has $1,000.00 owed
    When Sam records and confirms a $1,000.00 card payment from checking
    And reviews and confirms closing the now-zero card
    Then checking has $4,000.00 and the closed card has $0.00 owed
    And net worth remains $4,000.00
    And the payment and the card's earlier purchases remain available in history
    And the card payment is excluded from income and spending

  @V2_ACCOUNT_LIFECYCLE_005
  Scenario: Delete an unused zero account and undo the deletion
    Given Maya created "Test Savings" with a blank starting amount saved as $0.00
    And the account has no transactions, prices or corrections
    When she reviews and confirms deleting the unused account
    Then it leaves the account list without changing household wealth
    And she sees Undo
    When she chooses Undo twice
    Then exactly one "Test Savings" account returns with a $0.00 Balance
    And no financial activity is created

  @V2_ACCOUNT_LIFECYCLE_006
  Scenario: Preserve an account with saved financial history
    Given savings has a zero Balance after a recorded $1,000.00 transfer to checking
    When Maya chooses Delete account
    Then she sees that the saved transfer history must be retained
    And she can choose Archive or Close after reviewing the zero Balance
    When she cancels
    Then the account and both sides of the transfer remain unchanged

  @V2_ACCOUNT_LIFECYCLE_007
  Scenario: Delete an incomplete investment draft without changing wealth
    Given Maya saved a brokerage setup draft with an intended amount of $20,000.00
    And she has not supplied its complete cash and holdings
    And the draft has not been included in household wealth
    When she reviews and confirms deleting the draft
    Then the draft is removed and household wealth is unchanged
    When she chooses Undo
    Then the same incomplete draft returns for reviewed setup without becoming a completed account
