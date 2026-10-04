Feature: Manage household finances from setup through the monthly review
  As Maya and Sam
  We want our accounts, spending and investments to tell one understandable story
  So we can see where our money went and how our wealth changed

  @V2_JOURNEY_001
  Scenario: Set up known balances, manage September money and understand the household result
    Given today is September 1, 2026
    And Maya and Sam are starting their household with no accounts
    When they add "Everyday Checking" with $5,000.00 and "Emergency Savings" with $10,000.00
    And they add "Everyday Credit Card" with $1,000.00 owed
    And they add "Redwood Brokerage" with $15,000.00 cash and 50 HOME shares priced at $100.00
    And they add "Harbor 401k" with $60,000.00 cash and 200 HOME shares priced at $100.00
    And they add "Willow Traditional IRA" with $20,000.00 cash and 100 HOME shares priced at $100.00
    And they add "Harbor Cash Balance" with a cash value of $40,000.00
    Then all seven accounts appear in the account list with their September 1 starting amounts
    And household net worth is $184,000.00

    When Maya returns on September 30, 2026 to record the month's activity
    And she records September 5 salary of $6,000.00 into "Everyday Checking"
    And she records September 6 rent of $1,500.00 from checking
    And she records September 12 utilities of $180.00 from checking
    And she records September 18 insurance of $700.00 from checking
    And she records September 10 groceries of $620.00 on "Everyday Credit Card"
    And she records a September 14 grocery refund of $20.00 to that card
    And Sam records September 20 dining of $380.00 and September 22 travel of $300.00 on that card
    And they mark rent, groceries, utilities and insurance as essential spending
    And they mark dining and travel as discretionary spending
    And Maya records a September 15 transfer of $2,000.00 from checking to savings
    And she records a September 15 transfer of $1,000.00 from checking to brokerage
    And she records a September 25 card payment of $500.00 from checking
    Then checking has one Balance of $5,120.00
    And savings has one Balance of $12,000.00
    And the card's amount owed is $1,780.00

    When they review September spending against a budget of $3,600.00
    Then income is $6,000.00 and spending after the refund is $3,660.00
    And essential spending is $2,980.00 and discretionary spending is $680.00
    And they are $60.00 over budget
    And Income minus spending is $2,340.00
    And the $2,000.00 savings transfer, $1,000.00 brokerage transfer and $500.00 card payment are excluded from spending

    When they record September 30's HOME price of $110.00 in brokerage
    And they record unchanged HOME prices of $100.00 in the 401k and IRA on September 30
    And Sam records the unchanged $40,000.00 cash balance plan value on September 30
    And they open brokerage performance for September 1 through September 30
    Then brokerage's one Balance is $21,500.00 from $16,000.00 cash and $5,500.00 holdings
    And brokerage growth is $500.00 after separating the $1,000.00 transferred in
    And the $1,000.00 transferred in is not household income or investment growth

    When they return to household wealth
    Then financial assets are $188,620.00 and card debt is $1,780.00
    And net worth is $186,840.00
    And checking and savings contain $17,120.00
    And retirement accounts total $150,000.00 as part of the same household assets
    And they can open an account, an expense category or the investment result to see the amounts behind each summary

  @V2_JOURNEY_002
  Scenario: Begin without known balances and build a small household money history
    Given today is September 1, 2026
    And Maya has no accounts in her household
    When she creates checking account "Daily Money" and leaves its starting balance blank
    And she creates savings account "Rainy Day" and leaves its starting balance blank
    Then both accounts start at $0.00 on September 1, 2026
    When she opens "Daily Money"
    Then its details show $0.00 and no transactions
    When she edits its name to "Everyday Checking" and saves
    Then the account list shows the new name with the same $0.00 balance
    When she returns on September 7, 2026 to record her recent activity
    And she records salary of $3,000.00 into checking on September 5, 2026
    And she records a transfer of $500.00 from checking to savings on September 6, 2026
    And she records a grocery expense of $125.00 from checking on September 7, 2026
    Then checking contains $2,375.00 and savings contains $500.00
    When she opens the September spending summary
    Then income is $3,000.00 and spending is $125.00
    And the savings transfer is not spending
    And Income minus spending is $2,875.00
    And she can open groceries to find the $125.00 transaction

  @V2_JOURNEY_003
  Scenario: Review the same household month from spending and investment views
    Given the household has reviewed September income of $6,000.00 and spending of $3,660.00
    And its September 30 brokerage balance is $21,500.00 after a $1,000.00 transfer and $500.00 growth
    And its 401k and IRA cash plus holdings total $80,000.00 and $30,000.00
    And its defined benefit plan value is $40,000.00
    When Maya selects "Redwood Brokerage" in investments
    Then the selected account balance is $21,500.00
    And a separately labelled "All investment accounts" summary is $131,500.00
    When she returns to September spending
    Then income remains $6,000.00 and spending remains $3,660.00
    And viewing investments or changing an investment filter has not recorded another transaction

  @V2_JOURNEY_004
  Scenario: Enter the correct starting amount after initially leaving it blank
    Given Maya created "Everyday Checking" with a blank starting balance on September 1, 2026
    And the account therefore started at $0.00
    And she recorded $6,000.00 salary on September 5 and $1,500.00 rent on September 6
    And the account's one Balance is $4,500.00
    When she learns that the account actually held $5,000.00 on September 1
    And opens "Update balance" and chooses to correct the starting balance
    And enters $5,000.00 dated September 1, 2026 with reason "Starting amount was omitted during setup"
    Then the review shows the original $0.00, the corrected $5,000.00 and the September 1 date
    And it explains that Balance will change from $4,500.00 to $9,500.00
    When she confirms the correction
    Then Balance is $9,500.00 in the account list, details and household wealth
    And she can still see the original zero starting amount and its correction in balance history
    And the same salary and rent entries remain visible on their original dates
    And September income remains $6,000.00 and spending remains $1,500.00
    And correcting the starting amount does not add another $5,000.00 of income

  @V2_JOURNEY_005
  Scenario: Carry September into October and pay a recurring bill on its due date
    Given September ended with checking $5,120.00, savings $12,000.00 and card debt $1,780.00
    And brokerage has $16,000.00 cash and $5,500.00 of holdings
    And the 401k has $60,000.00 cash and $20,000.00 of holdings
    And the IRA has $20,000.00 cash and $10,000.00 of holdings
    And the defined benefit plan value is $40,000.00
    And September's net worth is $186,840.00 and spending is $3,660.00
    And a saved Electricity estimate is $180.00 due October 5, 2026
    When Maya opens October on October 1
    Then the accounts carry their closing balances forward without recording new income
    And October has no spending yet and the Electricity estimate is not a paid expense
    When she copies September's $3,600.00 Budget into October
    And on October 31 she records October 2 salary of $6,000.00 and October 3 rent of $1,500.00 in checking
    And she records the actual $180.00 Electricity payment from checking on October 5 against the due bill
    And she records $200.00 groceries on the card dated October 7
    And she records payment of $1,780.00 from checking to the card on October 10
    And she records a $500.00 transfer from checking to savings on October 15
    And she records unchanged investment prices and plan value for October 31
    Then checking's Balance is $7,160.00 and savings' Balance is $12,500.00
    And the card's Balance is $200.00 owed
    And October income is $6,000.00, spending is $1,880.00 and Income minus spending is $4,120.00
    And $1,720.00 of October's Budget remains
    And Electricity's next due date is November 5, 2026
    And October 31 net worth is $190,960.00
    When she switches back to September
    Then spending remains $3,660.00 and September 30 net worth remains $186,840.00

  @V2_JOURNEY_006
  Scenario: Connect take-home salary and retirement contributions without creating a checking transfer
    Given checking has $5,000.00
    And Sam's 401k has $60,000.00 cash and $20,000.00 of securities
    And these are the household's only accounts
    When Sam records $4,000.00 take-home salary into checking
    And records $600.00 employee contribution and $300.00 employer contribution into the 401k
    And records a $200.00 increase in the value of the 401k securities
    Then checking's Balance is $9,000.00 and the 401k's Balance is $81,100.00
    And household wealth has increased from $85,000.00 to $90,100.00
    And its explanation shows $4,000.00 take-home income, $900.00 retirement contributions and $200.00 investment growth
    And there is no $600.00 deduction or transfer from checking for the amount already withheld from payroll
