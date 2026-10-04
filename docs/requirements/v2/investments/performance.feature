Feature: Explain investment earnings from complete dated cash and holdings
  Opening plus incoming funding minus outgoing funding plus earnings equals ending Balance.
  Simple period return is earnings divided by opening plus incoming funding; it is not a forecast.

  @V2_PERFORMANCE_001
  Scenario: Follow brokerage setup through funding and a closing price
    Given Everyday Checking has Balance "$5,000.00" dated "2026-09-01" and no later activity
    And Redwood Brokerage opens that date with cash "$15,000.00" and 50 HOME shares at "$100.00", giving Balance "$20,000.00"
    When Maya records and saves a confirmed "$1,000.00" transfer from checking into Redwood Brokerage on "2026-09-15"
    And records HOME price "$110.00" and reviews complete cash and holdings for "2026-09-30"
    Then checking Balance is "$4,000.00" and brokerage cash is "$16,000.00"
    And brokerage holdings value is "$5,500.00" and Balance is "$21,500.00"
    When Maya opens performance from "2026-09-01" through "2026-09-30"
    Then the explanation shows opening "$20,000.00", incoming funding "$1,000.00", outgoing funding "$0.00" and earnings "$500.00"
    And simple period return is "2.38%" using "$500.00" divided by "$21,000.00"
    And the checking transfer is investment funding rather than household income, spending or investment profit
    And Maya can open the dated cash, prices and transfer used in the explanation

  @V2_PERFORMANCE_002
  Scenario: Keep selected performance separate from the whole investment group
    Given September 1 openings are Redwood Brokerage cash "$15,000.00" and 50 HOME shares at "$100.00"
    And Harbor 401k cash "$60,000.00" and 200 HOME shares at "$100.00", and Willow Traditional IRA cash "$20,000.00" and 100 HOME shares at "$100.00"
    And those are the household's only cash-and-holdings investment accounts
    And a confirmed "$1,000.00" transfer from checking enters brokerage on "2026-09-15"
    And complete September 30 values use brokerage cash "$16,000.00" and HOME price "$110.00", with the other cash amounts unchanged and their HOME prices "$100.00"
    When Sam selects Redwood Brokerage for September performance
    Then selected opening is "$20,000.00", ending "$21,500.00", funding "$1,000.00", earnings "$500.00" and simple period return "2.38%"
    And a separately labeled "All investment accounts" summary shows opening "$130,000.00", ending "$131,500.00", funding "$1,000.00" and earnings "$500.00"
    And whole-investment simple period return is "0.38%" using "$500.00" divided by "$131,000.00"
    And a plan-reported defined-benefit value is not mixed into this market investment return

  @V2_PERFORMANCE_003
  Scenario: Neutralize a transfer inside the selected investment group
    Given September 1 Redwood Brokerage has cash "$15,000.00" and 50 HOME shares at "$100.00"
    And Willow Traditional IRA has cash "$20,000.00" and 100 HOME shares at "$100.00"
    And both are the only accounts in the selected investment group
    When Maya records a confirmed linked "$1,000.00" movement from brokerage to IRA on "2026-09-15"
    And reviews September 30 cash "$14,000.00" in brokerage and "$21,000.00" in IRA with unchanged dated HOME prices "$100.00"
    Then account Balances are "$19,000.00" and "$31,000.00"
    And whole-group opening and ending are "$50,000.00" with incoming and outgoing funding "$0.00" and earnings "$0.00"
    And selecting only IRA shows incoming funding "$1,000.00" and earnings "$0.00"
    And the record describes a past movement without making a tax or contribution-eligibility claim

  @V2_PERFORMANCE_004
  Scenario: Require the requested period dates rather than nearby prices
    Given Redwood Brokerage has complete opening Balance "$20,000.00" dated "2026-09-01"
    And it has cash "$16,000.00" on "2026-09-30" and 50 HOME shares whose latest known price is "$110.00" dated "2026-09-29"
    And a confirmed "$1,000.00" contribution was recorded on "2026-09-15"
    When Sam requests performance ending exactly "2026-09-30"
    Then performance says "Missing September 30 HOME price" instead of silently using September 29
    And offers entering the missing price or explicitly choosing September 29 with complete cash for that date
    When Sam records HOME price "$112.00" for September 30 and confirms complete cash "$16,000.00" for that date
    Then ending Balance is "$21,600.00" and earnings are "$600.00" with simple period return "2.86%"
    And the original September 29 price stays available in history

  @V2_PERFORMANCE_005
  Scenario: Explain known dollar earnings when the percentage has no denominator
    Given Maya saved Redwood Brokerage opening on "2026-09-01" with starting amount blank, cash "$0.00" and no holdings
    And saving recorded that opening without a separate zero-confirmation action
    When Maya records actual investment interest "$100.00" dated "2026-09-30" and saves the review
    Then cash and Balance are "$100.00" with incoming and outgoing funding "$0.00"
    And the period explanation shows earnings "$100.00"
    And simple period return says "Not available: opening plus incoming funding is zero"
    And no return is invented from setup alone

  @V2_PERFORMANCE_006
  Scenario: Keep dividends and account fees in net earnings
    Given Redwood Brokerage on "2026-09-01" has cash "$1,000.00" and 90 HOME shares at "$100.00", giving Balance "$10,000.00"
    And September 30 HOME price is still "$100.00"
    When Maya records a cash dividend "$50.00" on "2026-09-10" and account fee "$10.00" on "2026-09-20"
    And reviews complete September 30 cash and holdings
    Then cash is "$1,040.00" and ending Balance is "$10,040.00"
    And incoming and outgoing external funding are "$0.00"
    And net investment earnings are "$40.00" and simple period return is "0.40%"
    And the explanation counts the dividend and fee once each

  @V2_PERFORMANCE_007
  Scenario: Treat a distribution as outgoing funding rather than an investment loss
    Given Willow Traditional IRA starts "2026-09-01" with cash "$20,000.00" and 100 HOME shares at "$100.00", giving Balance "$30,000.00"
    And Everyday Checking starts that date at "$5,000.00"
    When Maya records a linked "$1,000.00" withdrawal from IRA to checking on "2026-09-15"
    And confirms September 30 HOME price "$100.00" with no other activity
    Then IRA cash is "$19,000.00", IRA Balance is "$29,000.00" and checking Balance is "$6,000.00"
    And IRA performance shows outgoing funding "$1,000.00", earnings "$0.00" and simple period return "0.00%"
    And household wealth is unchanged and the transfer creates no salary income or spending

  @V2_PERFORMANCE_008
  Scenario: Count activity on a period boundary only once
    Given Redwood Brokerage has a complete closing Balance "$21,000.00" on "2026-09-30" after that date's "$1,000.00" contribution
    And October has no funding or withdrawals and complete closing Balance "$21,500.00" on "2026-10-31"
    When Sam reviews performance after "2026-09-30" through "2026-10-31"
    Then opening is "$21,000.00", funding "$0.00", earnings "$500.00" and simple period return "2.38%"
    And the September 30 contribution remains visible in September history but is not counted again in October
