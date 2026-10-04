Feature: Record purchases and dated prices without placing broker orders
  A saved purchase exchanges account cash for shares and changes the one Balance only by fees and prices.

  @V2_PURCHASE_001
  Scenario: Fund a purchase from existing cash and see the fee once
    Given Redwood Brokerage has cash "$2,000.00" and 80 HOME shares priced at "$100.00" on "2026-09-01", giving Balance "$10,000.00"
    When Maya records purchase of 5 HOME shares on "2026-09-10" at "$100.00" each with fee "$5.00"
    Then the review shows cash paid "$505.00", resulting cash "$1,495.00" and 85 shares worth "$8,500.00"
    When Maya saves the review
    Then the list, detail and wealth use Balance "$9,995.00"
    And the new purchase detail shows cost "$505.00" and known gain "-$5.00" at the unchanged "$100.00" price
    And no household purchase expense, new contribution or broker order is created
    And the "$5.00" fee reduces account value once

  @V2_PURCHASE_002
  Scenario: Keep two purchases on the same day separate
    Given Redwood Brokerage starts "2026-09-01" with cash "$5,000.00" and no holdings
    When Maya records 10 HOME shares bought on "2026-09-10" at "$100.00" with fee "$5.00"
    And records a second purchase of 5 HOME shares on the same date at "$110.00" with no fee
    And records a dated HOME price "$120.00" for "2026-09-10" and saves each review
    Then the purchase list has two entries costing "$1,005.00" and "$550.00"
    And cash is "$3,445.00", HOME shares total 15 and holding value is "$1,800.00"
    And purchase cost is "$1,555.00", known gain is "$245.00" and Balance is "$5,245.00"
    And neither purchase overwrites the other or creates external funding

  @V2_PURCHASE_003
  Scenario: Add a dated price and preserve original purchase costs
    Given Redwood Brokerage on "2026-09-10" has cash "$3,445.00" and 15 HOME shares at "$120.00" with known purchase cost "$1,555.00"
    When Sam enters HOME price "$130.00" dated "2026-09-30" and saves its reviewed effect
    Then holding value is "$1,950.00", known gain is "$395.00" and the single Balance is "$5,395.00"
    And September 10 history still shows Balance "$5,245.00" using its "$120.00" price
    And the original purchase dates and cost "$1,555.00" are unchanged
    And no income deposit or contribution is created by the price update

  @V2_PURCHASE_004
  Scenario: Record opening shares before recording later purchases
    Given Redwood Brokerage opening on "2026-09-01" has cash "$5,000.00" and 10 HOME shares at "$100.00" with cost "$800.00" and unknown original purchase date
    When Maya reviews tracking from that complete opening and saves
    Then opening Balance is "$6,000.00" and the 10 carried shares do not reduce cash again
    When Maya records a later purchase of 5 HOME shares on "2026-09-10" at "$110.00" with no fee
    And records HOME price "$110.00" for that date
    Then cash is "$4,450.00", holding value is "$1,650.00" and Balance is "$6,100.00"
    And known purchase cost is "$1,350.00" and the opening shares' original purchase date remains unknown
    And there is one cash-and-holdings tracking method with no silent change to a competing Balance

  @V2_PURCHASE_005
  Scenario: Review purchases against a conflicting statement before changing recorded shares
    Given Redwood Brokerage opening on "2026-09-01" has cash "$5,000.00" and 10 HOME shares at "$100.00"
    And Maya recorded 5 additional HOME shares bought on "2026-09-10" at "$110.00" without fee
    And its September 10 cash is "$4,450.00" and HOME price is "$110.00"
    When Sam adds a September 10 statement reporting only 10 HOME shares
    Then the review shows recorded shares 15, statement shares 10 and difference 5
    And asks whether a purchase, sale or statement needs correction before using it to change the holdings
    And current Balance stays "$6,100.00" until a reviewed correction is saved
    And no 5 shares are silently removed or described as reconciled

  @V2_PURCHASE_006
  Scenario Outline: Reject a purchase that cannot be funded or dated as completed activity
    Given today is "2026-10-03" and Redwood Brokerage opened "2026-09-01" with cash "$500.00" and no holdings
    When Maya enters <purchase>
    Then the form explains <message> and no cash or holding change is saved
    Examples:
      | purchase | message |
      | 5 shares at "$100.00" plus fee "$5.00" dated "2026-09-10" | "Cash is $5.00 short; record the funding before saving" |
      | 0 shares at "$100.00" dated "2026-09-10" | "Enter more than zero shares" |
      | 1 share at "$0.00" dated "2026-09-10" | "Enter a purchase price greater than zero" |
      | 1 share at "-$1.00" dated "2026-09-10" | "Enter a purchase price greater than zero" |
      | 1 share at "$100.00" with fee "-$1.00" dated "2026-09-10" | "Fee must be zero or greater" |
      | 1 share at "$100.00" dated "2026-10-04" | "Save a future reminder instead of completed activity" |
      | 1 share at "$100.00" dated "2026-08-31" | "Review the earlier tracking start before saving" |
