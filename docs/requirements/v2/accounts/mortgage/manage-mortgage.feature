Feature: Track a mortgage alongside a home's full value
  As Maya and Sam
  We want to see the home, debt and actual cost of each mortgage payment
  So principal payments and interest explain wealth correctly

  @V2_MORTGAGE_001
  Scenario: Create, view and edit a mortgage separately from the home
    Given Family Home has a $300,000.00 Balance and checking has $5,000.00
    And these are the household's only accounts before adding the mortgage
    When Maya adds Mortgage named "Home Mortgage" with joint owners Maya and Sam and lender "Maple Bank"
    And enters $200,000.00 owed dated September 1, 2026
    And reviews and confirms
    Then Home Mortgage shows one Balance labelled "$200,000.00 owed" in list and details
    And household assets are $305,000.00, debt is $200,000.00 and net worth is $105,000.00
    And the home's own Balance remains $300,000.00
    When Maya edits the mortgage's name to "Maple Mortgage" and confirms
    Then its name changes without changing debt, dates or the home's value

  @V2_MORTGAGE_002
  Scenario: Start a mortgage at zero when the amount is left blank
    Given Maya is adding Mortgage named "Future Home Mortgage"
    When she leaves Balance blank and reviews and confirms setup dated September 1, 2026
    Then the account shows $0.00 owed on that date
    And saving completes setup and adds $0.00 to household debt

  @V2_MORTGAGE_003
  Scenario: Record a mortgage payment and follow its wealth effect
    Given Family Home has $300,000.00, checking has $5,000.00 and Home Mortgage has $200,000.00 owed
    And these are the household's only accounts
    When Sam records one $1,200.00 mortgage payment from checking on September 15, 2026
    And assigns $800.00 to principal and $400.00 to interest
    And reviews and confirms
    Then checking has $3,800.00 and mortgage debt is $199,200.00
    And the home remains $300,000.00
    And spending includes $400.00 Mortgage interest and excludes $800.00 principal
    And household assets are $303,800.00 and net worth is $104,600.00
    And net worth fell by the $400.00 interest cost

  @V2_MORTGAGE_004
  Scenario: Correct the payment portions and retain the original
    Given checking has $3,800.00 after one $1,200.00 mortgage payment
    And mortgage debt is $199,200.00 after the payment's $800.00 principal
    And spending includes its $400.00 interest
    When Maya reviews changing the same payment to $850.00 principal and $350.00 interest
    And confirms with reason "Use lender's actual payment breakdown"
    Then checking stays $3,800.00 and mortgage debt becomes $199,150.00
    And interest spending becomes $350.00
    And the original portions and correction reason remain in history

  @V2_MORTGAGE_005
  Scenario: Remove and restore both sides of a mortgage payment
    Given checking started at $5,000.00 and mortgage debt at $200,000.00
    And one saved $1,200.00 payment contains $800.00 principal and $400.00 interest
    When Sam reviews removing that payment
    Then the review shows checking returning to $5,000.00, debt returning to $200,000.00 and interest spending reduced by $400.00
    When he confirms
    Then both balances and spending change together and the removed payment remains in history
    When he chooses Undo twice
    Then exactly one payment returns with checking at $3,800.00, debt at $199,200.00 and interest spending $400.00

  @V2_MORTGAGE_006
  Scenario: Require all payment portions to equal the money leaving checking
    Given checking has $5,000.00 and mortgage debt is $200,000.00
    When Maya enters a $1,200.00 payment with $800.00 principal and $350.00 interest
    And tries to confirm
    Then she sees that $50.00 remains unassigned
    And no payment is saved and neither Balance changes

  @V2_MORTGAGE_007
  Scenario Outline: Reject an invalid initial mortgage amount
    Given Sam is creating Home Mortgage
    When he enters Balance <amount> and tries to save
    Then he sees <message> and no mortgage is created

    Examples:
      | amount | message |
      | -1.00 | Enter zero or a positive amount owed |
      | abc | Enter a valid amount |

  @V2_MORTGAGE_008
  Scenario: Review a dated lender correction without creating income
    Given Home Mortgage has $200,000.00 owed dated September 1, 2026
    When Maya reviews updating the debt to $199,900.00 dated September 30 with reason "Lender correction"
    And confirms
    Then the effective September 30 Balance is $199,900.00 owed
    And September 1 history still shows $200,000.00
    And the wealth explanation identifies a $100.00 debt correction without a payment or income entry
    When she reviews another correction and cancels
    Then Balance and history remain unchanged
