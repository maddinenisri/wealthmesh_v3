Feature: Split one expense across spending categories
  As Maya and Sam
  We want to explain mixed purchases without recording the same payment twice
  So the amount leaving an account equals the sum of its spending portions

  @V2_SPLITS_001
  Scenario: Record a mixed shopping purchase and view its portions
    Given checking has $5,000.00 on September 1, 2026
    When Maya records one $120.00 shopping expense on September 10
    And assigns $90.00 to Groceries as Essential and $30.00 to Gifts as Discretionary
    And reviews and confirms the split
    Then checking has a Balance of $4,880.00
    And September spending is $120.00 from one payment
    And Groceries shows $90.00 and Gifts shows $30.00
    And opening either portion shows the same payment and its full split

  @V2_SPLITS_002
  Scenario: Correct the portions without changing the payment
    Given one saved $120.00 expense has $90.00 in Groceries and $30.00 in Gifts
    And checking's Balance is $4,880.00 after that expense
    When Sam reviews changing the split to $80.00 Groceries and $40.00 Gifts
    And confirms with reason "Gift receipt was ten dollars higher"
    Then Groceries shows $80.00 and Gifts shows $40.00
    And total spending remains $120.00 and checking remains $4,880.00
    And the original split and reason remain in history

  @V2_SPLITS_003
  Scenario: Require the portions to equal the payment amount
    Given Maya is entering a $120.00 expense from checking with a Balance of $5,000.00
    When she enters $90.00 Groceries and $25.00 Gifts and tries to confirm
    Then the review shows $115.00 assigned and $5.00 still to assign
    And the expense is not saved and checking remains $5,000.00
    When she changes Gifts to $30.00 and confirms
    Then one $120.00 expense is saved with checking at $4,880.00

  @V2_SPLITS_004
  Scenario: Remove and restore an entire split expense
    Given checking started with $5,000.00 and has one $120.00 split expense
    And the portions are $90.00 Groceries and $30.00 Gifts
    When Maya reviews removing the payment
    Then the review shows both portions and the $120.00 return to checking
    When she confirms
    Then checking has $5,000.00 and both portions are excluded from spending
    And the removed payment and its portions remain in history
    When she chooses Undo twice
    Then one payment with both portions returns
    And checking has $4,880.00 and total spending is $120.00

  @V2_SPLITS_005
  Scenario: Cancel a split correction
    Given a saved $120.00 payment is split into $90.00 Groceries and $30.00 Gifts
    When Sam reviews changing its amount, date, account and portions
    And cancels
    Then the original payment, account, date and split remain unchanged
