Feature: Understand the household's wealth
  As Maya and Sam
  We want to see what we own, what we owe and the dates behind our balances
  So we can connect everyday money and long-term savings without counting anything twice

  @V2_WEALTH_001
  Scenario: View a dated household snapshot and open an account behind a total
    Given "Everyday Checking" has a balance of $5,120.00 on September 30, 2026
    And "Emergency Savings" has a balance of $12,000.00 on September 30, 2026
    And "Everyday Credit Card" has an amount owed of $1,780.00 on September 30, 2026
    And "Redwood Brokerage" has $16,000.00 cash and $5,500.00 of holdings on September 30, 2026
    And "Harbor 401k" has $60,000.00 cash and $20,000.00 of holdings on September 30, 2026
    And "Willow Traditional IRA" has $20,000.00 cash and $10,000.00 of holdings on September 30, 2026
    And "Harbor Cash Balance" has a cash value of $40,000.00 on September 30, 2026
    And these are the household's only accounts
    When Maya opens the household overview
    Then she sees financial assets of $188,620.00
    And she sees credit card debt of $1,780.00
    And she sees net worth of $186,840.00
    And she sees $17,120.00 in checking and savings accounts
    When she opens the checking and savings total
    Then she sees "Everyday Checking" at $5,120.00 and "Emergency Savings" at $12,000.00
    And she can open either account to view its September 30 balance and history

  @V2_WEALTH_002
  Scenario: Understand that retirement and investment groups overlap
    Given the household's September 30 financial assets are $188,620.00 and credit card debt is $1,780.00
    And those assets include "Redwood Brokerage" at $21,500.00
    And "Harbor 401k" at $80,000.00
    And "Willow Traditional IRA" at $30,000.00
    And "Harbor Cash Balance" at $40,000.00
    When Sam views the retirement and investment summaries
    Then retirement accounts total $150,000.00
    And investment accounts total $131,500.00
    And the summaries explain that the 401k and Traditional IRA appear in both groups
    And the defined benefit cash value appears in Retirement without being treated as personally held investment cash or securities
    And the household net worth remains $186,840.00
    And neither group is added again to financial assets

  @V2_WEALTH_003
  Scenario: See card debt and a separate card credit without hiding either
    Given the household's only bank accounts total $15,000.00
    And "Everyday Credit Card" has an amount owed of $1,000.00
    And "Travel Card" has a credit of $50.00 after a refund
    When Maya opens household wealth
    Then financial assets are $15,050.00 including the $50.00 card credit
    And card debt is $1,000.00
    And net worth is $14,050.00
    And checking and savings still total $15,000.00
    And the card list separately shows $1,000.00 owed and a $50.00 credit

  @V2_WEALTH_004
  Scenario: Notice an older balance before relying on the household total
    Given the household's only accounts are "Everyday Checking" and "Redwood Brokerage"
    And checking has a balance of $5,120.00 dated September 30, 2026
    And brokerage has $15,000.00 cash and 50 HOME shares last priced at $100.00 on September 1, 2026
    When Maya opens household wealth on September 30, 2026
    Then she sees financial assets of $25,120.00 using each account's one Balance
    And brokerage shows a $20,000.00 Balance with prices last updated on September 1
    And the overview explains that the balances come from different dates
    When she opens brokerage and records HOME's price as $130.00 dated September 30, 2026
    Then the household total becomes $26,620.00
    And brokerage's one Balance is $21,500.00 from $15,000.00 cash and $6,500.00 of holdings
    And the older $20,000.00 balance remains visible in brokerage history

  @V2_WEALTH_005
  Scenario: Review a missing starting amount in an account that already has spending
    Given Maya opens a household file saved by an older version of the application
    And its "Everyday Checking" account contains a $100.00 grocery expense on September 10, 2026
    And the file has no starting amount for that account
    When Maya opens the account
    Then its one Balance says "Starting balance needed"
    And she can see the $100.00 grocery expense
    When she enters and reviews a starting balance of $5,000.00 on September 1, 2026
    And confirms it
    Then its one Balance is $4,900.00 in the account list, details and household wealth
    And the grocery expense remains unchanged
    And recovering missing information has not created another expense or income entry

  @V2_WEALTH_006
  Scenario: Replace a balance correction with a discovered bank fee
    Given "Everyday Checking" started with $5,000.00 on September 1, 2026
    And Maya recorded salary of $6,000.00 and rent of $1,500.00
    And she recorded transfers of $2,000.00 to savings and $1,000.00 to brokerage
    And she recorded a $500.00 payment to her credit card
    When Maya chooses Update balance and enters $5,960.00 dated September 30, 2026
    Then the review shows the current $6,000.00, the requested $5,960.00 and a $40.00 reduction
    When she confirms with reason "Match the amount shown by my bank"
    Then the account has one Balance of $5,960.00 everywhere
    And the $40.00 correction appears in history without becoming spending
    When she later finds a missing $40.00 bank fee and chooses to replace that correction with the actual fee
    Then the review explains that the correction will no longer reduce the account and the fee will reduce it once
    When she confirms
    Then Balance remains $5,960.00
    And September spending is $1,540.00 from rent and the fee
    And the correction and its replacement remain visible in history

  @V2_WEALTH_007
  Scenario: Connect spending, investment growth and the change in wealth
    Given the household's net worth was $184,000.00 on September 1, 2026
    And September income is $6,000.00 and spending is $3,660.00
    And the only investment growth during September is $500.00
    And there are no other changes in the household's assets or debts
    When Sam reviews the September household summary
    Then Income minus spending is $2,340.00
    And investment growth is shown separately as $500.00
    And net worth has increased by $2,840.00 to $186,840.00
    And transfers between household accounts are not shown as additional income or spending

  @V2_WEALTH_008
  Scenario: Include Roth IRA and HSA in explicitly named groups
    Given the household's seven September 30 accounts have assets of $188,620.00 and card debt of $1,780.00
    And those accounts include investment accounts of $131,500.00 and retirement accounts of $150,000.00
    And Maya adds "Willow Roth IRA" with $1,000.00 cash and $5,000.00 of holdings
    And she adds "Health Savings" with $1,050.00 cash and $2,000.00 of holdings
    When she opens the household groups
    Then financial assets are $197,670.00 and net worth is $195,890.00
    And Investments is $140,550.00 including both new accounts
    And Retirement is $156,000.00 including the Roth IRA but excluding the HSA
    And Health savings is $3,050.00 from the HSA
    And these groups explain their account membership without adding their amounts again to wealth

  @V2_WEALTH_009
  Scenario: View an earlier net worth without applying later transactions or prices
    Given the household's complete September 30 balances give net worth of $186,840.00
    And its complete October 31 balances give net worth of $190,960.00
    When Sam chooses September 30, 2026 as the wealth date
    Then net worth is $186,840.00
    And he sees only account activity and price values effective on or before September 30
    When he opens the trend through October 31
    Then September 30 shows $186,840.00 and October 31 shows $190,960.00
    And the increase during October is $4,120.00

  @V2_WEALTH_010
  Scenario: Explain dividends and fees once when wealth changes
    Given checking has $5,000.00 and brokerage has $1,000.00 cash plus $9,000.00 of securities
    And there are no other accounts or debts
    And securities prices do not change during September
    When Maya records a $50.00 cash dividend and a $10.00 investment fee in brokerage
    Then brokerage's Balance is $10,040.00 and household wealth is $15,040.00
    When she reviews why wealth increased
    Then dividend income is $50.00 and fee spending is $10.00
    And Income minus spending is $40.00
    And net investment earnings is also $40.00 with an explanation that it includes that same dividend and fee
    And the wealth change is $40.00 rather than adding both explanations to claim $80.00

  @V2_WEALTH_011
  Scenario: Count an overdraft as debt while showing bank money honestly
    Given checking has a Balance of negative $100.00 after an actual expense
    And savings has $5,000.00 and a card has $1,000.00 owed
    And these are the household's only accounts
    When Maya opens household wealth
    Then assets are $5,000.00 and debt is $1,100.00 including the $100.00 overdraft
    And net worth is $3,900.00
    And Bank money is $4,900.00 with checking's negative amount visible
    And the overdraft is counted once without changing checking's single Balance to zero
