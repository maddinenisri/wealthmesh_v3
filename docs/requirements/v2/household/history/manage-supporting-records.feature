Feature: Keep reviewed supporting statements without competing account balances
  As Maya and Sam
  We want original statements and corrected copies available beside our history
  So we can explain a correction without making a second account Balance

  @V2_SUPPORTING_RECORD_001
  Scenario: Keep an original statement when adding a corrected copy
    Given Maya's card has one Balance of $1,000.00 owed dated September 30, 2026
    And she has attached its September statement as optional supporting information
    When she adds a corrected September statement for the same account and date
    And reviews and confirms with reason "Issuer supplied a corrected statement"
    Then the corrected copy is identified as the latest supporting version
    And the original copy remains available with its original date
    And history shows Maya's selected name, time, reason and the link between the two versions
    And the card still has one $1,000.00 owed Balance until Maya separately reviews actual activity or a Balance correction

  @V2_SUPPORTING_RECORD_002
  Scenario: Remove and restore a supporting statement without removing money
    Given Redwood Brokerage has $15,000.00 cash and 50 HOME shares at $100.00 dated September 1, 2026
    And its completed opening review is linked to an optional supporting statement
    When Sam reviews removing that statement
    Then he sees the linked opening review and that its recorded cash, shares and price will remain
    When he confirms
    Then the attachment is unavailable from active supporting records
    And brokerage's one Balance remains $20,000.00 with its opening breakdown intact
    And removal remains in history and Undo is available
    When he chooses Undo twice
    Then the same statement and opening-review link return once without duplicating holdings or changing Balance

  @V2_SUPPORTING_RECORD_003
  Scenario: Cancel a statement revision
    Given checking has one Balance of $5,000.00 and an attached September statement
    When Maya reviews replacing the active supporting copy with a corrected version
    And cancels
    Then the original statement remains the active supporting version
    And no revision, financial entry or Balance correction is saved
