Feature: Understand what the household spent in a month
  Maya and Sam review Income, spending and their Budget for the selected month.
  Transfers, card repayments and Balance corrections do not become spending.
  These independent examples use USD and September 2026 unless another month is selected.

  @V2_MONTHLY_001
  Scenario: Follow September spending back to the household's purchases and bills
    Given September has Salary income "$6,000.00" into Everyday Checking on "2026-09-02"
    And checking paid Rent "$1,500.00" on "2026-09-03", Utilities "$180.00" on "2026-09-05" and Insurance "$700.00" on "2026-09-08"
    And Everyday Credit Card has Groceries "$620.00" on "2026-09-06", a Groceries refund "$20.00" on "2026-09-12", Dining "$380.00" on "2026-09-11" and Travel "$300.00" on "2026-09-22"
    And checking moved "$2,000.00" to Emergency Savings on "2026-09-04", "$1,000.00" to Redwood Brokerage on "2026-09-05" and paid the card "$500.00" on "2026-09-20"
    And Rent, Utilities, Insurance and Groceries are Essential, while Dining and Travel are Discretionary
    When Maya opens September Spending for all household accounts
    Then income is "$6,000.00", spending is "$3,660.00" and Income minus spending is "$2,340.00"
    And Essential spending is "$2,980.00" and Discretionary spending is "$680.00"
    And Salary appears under income while the seven purchase, bill and refund entries explain spending
    And the two transfers and card repayment are excluded from both income and spending
    When she opens Groceries
    Then the "$620.00" purchase and "$20.00" refund explain the "$600.00" category total

  @V2_MONTHLY_002
  Scenario: Keep a card repayment out of a card's monthly purchase total
    Given Everyday Credit Card has a "$620.00" Groceries purchase on "2026-09-06" and a "$20.00" Groceries refund on "2026-09-12"
    And checking paid that card "$500.00" on "2026-09-20"
    And the card also has a "$90.00" purchase dated "2026-08-31"
    When Sam selects September and Everyday Credit Card in Spending
    Then Groceries spending is "$600.00" from the September purchase and refund
    And opening the category shows each entry's date, card and amount
    And the "$500.00" repayment and August purchase do not appear as September expenses

  @V2_MONTHLY_003
  Scenario: Explain spending above the selected month's Budget
    Given September spending is Rent "$1,500.00", Utilities "$180.00", Insurance "$700.00", Groceries "$600.00", Dining "$380.00" and Travel "$300.00"
    And September's Budget is "$3,600.00" while October's Budget is "$4,000.00"
    When Maya opens September's spending review
    Then she sees spending "$3,660.00", September's Budget "$3,600.00" and "$60.00 over Budget"
    And the review offers category details so she can see where spending exceeded its targets
    And October's Budget is not used to describe September

  @V2_MONTHLY_004
  Scenario: Understand Income minus spending alongside the account Balance
    Given September Salary income is "$6,000.00" and recorded expenses total "$3,660.00"
    And Everyday Checking has a Balance of "$5,120.00" dated "2026-09-30"
    When Sam reviews September and opens checking detail
    Then the monthly review shows "$2,340.00 Income minus spending"
    And checking detail shows the Balance "$5,120.00" dated "2026-09-30"
    And opening checking has changed neither September Income nor spending

  @V2_MONTHLY_005
  Scenario: Label an annual spending estimate based on only one recorded month
    Given September is the only month with recorded expenses and its spending is "$3,660.00"
    And no expenses have been entered for October
    When Maya opens spending history and its annual spending estimate
    Then the average recorded month is "$3,660.00" based on one month
    And "$43,920.00" is labeled an annual spending estimate based on that one month
    And the view does not present this as twelve months of actual spending
    When she selects October
    Then she sees "No expenses recorded for October"
    And September's spending is not copied into October as actual spending
