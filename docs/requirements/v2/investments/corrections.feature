Feature: Review investment corrections, removal and undo while preserving history
  A reviewed change updates the same Balance and explains affected cash, holdings and dated views.

  @V2_INV_CORRECTION_001
  Scenario: Remove and undo a purchase with its cash and fee together
    Given Redwood Brokerage opened "2026-09-01" with cash "$2,000.00" and no holdings
    And a September 10 purchase of 10 HOME shares at "$100.00" with fee "$5.00" left cash "$995.00", holdings "$1,000.00" and Balance "$1,995.00"
    And no later activity depends on those shares
    When Maya chooses to remove that purchase with reason "Entered the wrong account"
    Then the review shows cash restored to "$2,000.00", shares reduced to 0 and the fee removed together
    When Maya confirms
    Then Balance is "$2,000.00" and history shows the purchase as removed with Maya's reason
    When Maya chooses Undo and reviews and saves
    Then cash is "$995.00", shares are 10 and Balance "$1,995.00" with the same original purchase date and cost
    And history retains both removal and undo without creating another purchase

  @V2_INV_CORRECTION_002
  Scenario: Review sale dependencies before removing proceeds already withdrawn
    Given Redwood Brokerage opened "2026-09-01" with cash "$100.00" and 10 HOME shares priced at "$100.00", giving Balance "$1,100.00"
    And Everyday Checking opened "2026-09-01" with "$1,000.00"
    And a saved September 10 sale of 5 shares at "$100.00" with fee "$5.00" produced cash "$595.00" and 5 remaining shares
    And a linked September 15 "$500.00" withdrawal to checking left brokerage cash "$95.00", Balance "$595.00" and checking "$1,500.00"
    When Sam asks to remove only the sale
    Then the review shows 1 dependent withdrawal and cash would become "-$400.00"
    And removal cannot save a negative investment cash position
    When Sam chooses to remove the sale and dependent withdrawal together and confirms their review
    Then brokerage cash is "$100.00", shares are 10 and Balance "$1,100.00", while checking returns to "$1,000.00"
    And both removals remain in history
    When Sam reviews and confirms Undo for the combined action
    Then brokerage Balance returns to "$595.00" and checking to "$1,500.00" with each original entry restored once

  @V2_INV_CORRECTION_003
  Scenario: Correct purchase price without rewriting the current market price
    Given Redwood Brokerage opened "2026-09-01" with cash "$1,500.00" and no holdings
    And a September 10 purchase of 5 HOME shares at "$100.00" with fee "$5.00" left cash "$995.00"
    And HOME price "$120.00" dated "2026-09-30" makes current holding value "$600.00" and Balance "$1,595.00"
    When Maya corrects the purchase price to "$110.00" with reason "Correct purchase confirmation"
    Then the review shows purchase cost changing from "$505.00" to "$555.00", cash to "$945.00" and Balance to "$1,545.00"
    And September purchase history and the September performance explanation are listed as affected
    When Maya saves
    Then shares stay 5, market price stays "$120.00", known gain is "$45.00" and Balance is "$1,545.00"
    And history retains the original purchase cost, correction and reason

  @V2_INV_CORRECTION_004
  Scenario: Review removal and undo of a dated price used by performance
    Given Redwood Brokerage has cash "$1,000.00" and 10 HOME shares
    And HOME prices are "$100.00" dated "2026-09-01" and "$120.00" dated "2026-09-30"
    And complete September cash and holdings make opening Balance "$2,000.00" and ending Balance "$2,200.00"
    When Sam chooses to remove the September 30 price
    Then the review shows 1 affected holding and the September performance ending price would be missing
    When Sam confirms the removal
    Then current holdings show the remaining September 1 price date and Balance "$2,000.00"
    And exact September 30 performance says "Missing September 30 HOME price" rather than using the older price
    When Sam reviews and confirms Undo
    Then the September 30 price "$120.00", ending Balance "$2,200.00" and earnings "$200.00" return once
    And price history retains both actions

  @V2_INV_CORRECTION_005
  Scenario: Remove a supporting statement without silently removing saved holdings
    Given Redwood Brokerage has opening cash "$15,000.00" and 50 HOME shares at "$100.00" dated "2026-09-01"
    And its opening review used a saved September 1 statement supporting those components
    When Maya chooses to remove the supporting statement
    Then the review identifies 1 opening breakdown using it and explains that recorded cash, shares and price would remain
    When Maya confirms removing the attachment while retaining the opening breakdown
    Then Balance stays "$20,000.00" and the opening cash and holdings remain visible
    And the attachment removal remains in history without erasing the account's financial records

  @V2_INV_CORRECTION_006
  Scenario: Extend tracking earlier without charging an opening purchase twice
    Given Redwood Brokerage starts tracking "2026-09-01" with cash "$1,900.00" and 1 HOME share at "$100.00", giving Balance "$2,000.00"
    And that opening share's original purchase date is unknown
    And a September 10 purchase of 5 more shares at "$100.00" without fee leaves cash "$1,400.00" and 6 shares
    When Maya records that the opening share was actually bought on "2026-08-31" for "$100.00"
    Then the review asks for earlier tracking rather than saving another September cash deduction
    When Maya supplies earlier opening "2026-08-30" with cash "$2,000.00" and no holdings
    And links the August purchase to the existing opening share and saves the reviewed history
    Then August 31 cash is "$1,900.00" with 1 share and September 10 cash remains "$1,400.00" with 6 shares
    And current Balance stays "$2,000.00" at the unchanged "$100.00" price
    And the original September opening and historical correction remain reviewable

  @V2_INV_CORRECTION_007
  Scenario: Remove and undo a dividend reinvestment as one linked action
    Given Willow Roth IRA opened "2026-09-01" with cash "$1,000.00" and 50 HOME shares at "$100.00"
    And a saved September 10 dividend "$50.00" reinvested into 0.5 HOME shares left cash "$1,000.00" and Balance "$6,050.00"
    And no later sale depends on the added shares
    When Maya reviews and confirms removing the linked dividend and purchase together
    Then cash stays "$1,000.00", shares return to 50 and Balance is "$6,000.00"
    And earnings no longer include that dividend, while removed history remains visible
    When Maya reviews and confirms Undo
    Then cash stays "$1,000.00", shares return to 50.5 and Balance "$6,050.00" with dividend earnings "$50.00" once

  @V2_INV_CORRECTION_008
  Scenario: Archive a nonzero account without hiding wealth and close only at zero
    Given Willow Roth IRA has cash "$1,000.00" and no holdings dated "2026-09-01"
    And Everyday Checking has Balance "$5,000.00"
    When Maya archives Roth IRA after reviewing its nonzero amount
    Then it leaves the everyday active list but its "$1,000.00" stays in household wealth and Retirement
    When Maya asks to close it
    Then the review requires a zero Balance and shows the remaining cash
    When Maya records a confirmed "$1,000.00" transfer to checking and reviews closing the now-zero account
    Then checking Balance is "$6,000.00", Roth Balance is "$0.00" and household wealth is unchanged
    And closing retains the opening, transfer and ownership history

  @V2_INV_CORRECTION_009
  Scenario: Review a dependent sale before removing the purchase that supplied its shares
    Given Redwood Brokerage opened "2026-09-01" with cash "$2,000.00" and no holdings
    And a September 10 purchase of 10 HOME shares at "$100.00" with no fee left cash "$1,000.00"
    And September 15 HOME price "$120.00" and a completed sale of 4 selected shares at that price left cash "$1,480.00" and 6 shares worth "$720.00"
    When Maya asks to remove the original purchase
    Then the review identifies 1 dependent sale and explains that removing only the purchase would leave sold shares without their source
    And Maya must review the related sale or cancel instead of saving an inconsistent share history
    When Maya cancels the removal
    Then cash stays "$1,480.00", shares stay 6 and Balance stays "$2,200.00"
    And the original purchase and sale remain available
