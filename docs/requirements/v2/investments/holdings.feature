Feature: See complete investment cash and holdings with clear partial cost information
  One Balance comes from cash and all holdings; source statements support review and dated history.

  @V2_HOLDINGS_001
  Scenario: View an empty investment group without inventing positions
    Given the household has no completed investment accounts
    And an unfinished Redwood Brokerage draft contains an opening amount "$20,000.00" without cash or holdings
    When Maya opens Investments
    Then the completed investment group is empty and the draft is offered under "Finish setup"
    And no draft amount is included in household wealth
    And no holding shares, purchase costs or investment return are shown as known

  @V2_HOLDINGS_002
  Scenario: Read one security across three accounts and distinguish known cost from value coverage
    Given September 30 cash and holdings are Redwood Brokerage cash "$16,000.00" plus 50 "HOME" shares at "$110.00" with known cost "$4,500.00"
    And Harbor 401k cash "$60,000.00" plus 200 "HOME" shares at "$100.00" with known cost "$15,000.00"
    And Willow Traditional IRA cash "$20,000.00" plus 100 "HOME" shares at "$100.00" with purchase cost unknown
    When Maya opens the whole investment group and selects "HOME"
    Then it shows 350 shares valued at "$35,500.00" across three accounts
    And known purchase cost is "$19,500.00" and known gain is "$6,000.00" for 250 shares
    And full purchase cost and full gain say "Not available" because 100 shares have unknown cost
    And known-cost share coverage is "71.43%"
    And the one account Balances are "$21,500.00", "$80,000.00" and "$30,000.00", totaling "$131,500.00"
    And HOME value is "27.00%" of that investment Balance, which is a different measure from known-cost share coverage
    And Maya can open each account's cash, shares, price date and purchase cost explanation

  @V2_HOLDINGS_003
  Scenario: Keep selected-account holdings and whole-investment summaries clearly separate
    Given Redwood Brokerage on "2026-09-30" has cash "$16,000.00" and 50 HOME shares priced at "$110.00"
    And Harbor 401k has cash "$60,000.00" and 200 HOME shares priced at "$100.00" on the same date
    And Willow Traditional IRA has cash "$20,000.00" and 100 HOME shares priced at "$100.00" on the same date
    When Sam selects Redwood Brokerage
    Then selected-account cash is "$16,000.00", holdings value is "$5,500.00" and Balance is "$21,500.00"
    And HOME is "25.58%" of the selected account Balance
    And a separately labeled "All investment accounts" summary shows "$131,500.00"
    And neither the selected heading nor the selected holdings list includes the other accounts

  @V2_HOLDINGS_004
  Scenario: Display HSA holdings with partial purchase cost
    Given Meadow HSA on "2026-09-30" has cash "$500.00" and 14 CARE shares priced at "$250.00"
    And 2 CARE shares have known purchase cost "$400.00" while 12 have unknown cost
    When Maya opens Meadow HSA and CARE details
    Then CARE value is "$3,500.00" and the single HSA Balance is "$4,000.00"
    And the known 2 shares show value "$500.00", purchase cost "$400.00" and gain "$100.00"
    And full gain and cost remain "Not available" with known-cost share coverage "14.29%"
    And no gain for the other 12 shares is invented

  @V2_HOLDINGS_005
  Scenario: Review a dated statement without replacing the calculated Balance
    Given Redwood Brokerage on "2026-09-30" has cash "$16,000.00" and 50 HOME shares priced at "$110.00", giving Balance "$21,500.00"
    When Maya adds a September 30 statement reporting total "$21,400.00"
    Then the review shows a "$100.00" difference and asks which cash, quantity or price needs correction
    And the account list, detail and wealth keep the same calculated Balance "$21,500.00"
    And the statement is available as supporting history rather than a second editable account Balance
    When Maya cancels the proposed cash or holding correction
    Then the components and calculated Balance remain unchanged

  @V2_HOLDINGS_006
  Scenario: See mixed price dates before asking for exact-date performance
    Given Redwood Brokerage has cash "$16,000.00" and 50 HOME shares at "$110.00" dated "2026-09-30"
    And Harbor 401k has cash "$60,000.00" and 200 HOME shares whose latest price is "$100.00" dated "2026-09-29"
    When Sam opens current investment holdings on "2026-09-30"
    Then account components show their dates and the summary warns that price dates differ
    And no September 29 price is described as a September 30 observation
    When Sam requests performance ending exactly "2026-09-30" for both accounts
    Then the view asks for the missing September 30 Harbor 401k price or an explicit different ending date

  @V2_HOLDINGS_007
  Scenario: Keep plan value and investment cash in their proper groups
    Given September 30 Balances are Redwood Brokerage "$21,500.00", Harbor 401k "$80,000.00", Willow Traditional IRA "$30,000.00" and Harbor Cash Balance plan value "$40,000.00"
    And those are the household's only investment and retirement accounts
    When Maya opens Investments and Retirement
    Then Investments shows the three cash-and-holdings accounts totaling "$131,500.00"
    And Retirement shows Harbor 401k, Willow Traditional IRA and Harbor Cash Balance totaling "$150,000.00"
    And the plan's "$40,000.00" is not presented as personal investment cash or added again to household wealth

  @V2_HOLDINGS_008
  Scenario Outline: Review a known zero market price without deleting the holding
    Given <account> opens "2026-09-01" with cash "$1,000.00" and 10 HOME shares at "$100.00", giving Balance "$2,000.00"
    And those shares have purchase cost <cost>
    When Maya enters a known HOME market price "$0.00" dated "2026-09-30"
    Then the review highlights the zero value and explains that 10 shares remain recorded
    When Maya saves the reviewed price
    Then HOME holding value is "$0.00" and the single account Balance is "$1,000.00", equal to cash
    And shares remain 10, purchase cost remains <cost> and holding gain shows <gain>
    And the list, account detail and household wealth use the same Balance "$1,000.00"
    And a missing price would still say "Not available" rather than becoming zero
    Examples:
      | account | cost | gain |
      | Redwood Brokerage | "$200.00" | "-$200.00" |
      | Harbor 401k | "$200.00" | "-$200.00" |
      | Willow Traditional IRA | "$200.00" | "-$200.00" |
      | Willow Roth IRA | "$200.00" | "-$200.00" |
      | Meadow HSA | "$200.00" | "-$200.00" |
      | Meadow HSA | unknown | "Not available" |
