Feature: Record sales and the cash received without placing broker orders
  A completed sale reduces selected shares, adds received net proceeds to cash and retains purchase history.
  Realized gain compares received proceeds with selected purchase cost; it is not additional cash income or extra wealth.

  @V2_SALE_001
  Scenario: Select the shares sold and review known realized gain
    Given Redwood Brokerage has cash "$1,000.00" and 10 HOME shares priced at "$120.00" on "2026-09-10", giving Balance "$2,200.00"
    And the 10 shares come from a recorded purchase costing "$1,005.00"
    When Maya records a sale of 4 of those shares on "2026-09-15" at "$120.00" with fee "$5.00"
    Then the review shows gross proceeds "$480.00", net cash received "$475.00" and selected purchase cost "$402.00"
    And known realized gain is "$73.00" without making a tax calculation
    When Maya saves the review
    Then cash is "$1,475.00", 6 HOME shares remain worth "$720.00" and Balance is "$2,195.00"
    And remaining known purchase cost is "$603.00" and the original 10-share purchase remains in history
    And no external contribution or broker order is created

  @V2_SALE_002
  Scenario: Preserve unknown gain when the selected shares have unknown cost
    Given Meadow HSA has cash "$500.00" and 10 CARE shares priced at "$100.00" on "2026-09-10" with unknown purchase cost
    When Maya records a sale of 3 CARE shares on "2026-09-15" at "$100.00" with no fee and saves the review
    Then cash is "$800.00", 7 CARE shares remain worth "$700.00" and Balance stays "$1,500.00"
    And sale proceeds are "$300.00" while realized gain and remaining purchase cost say "Not available"
    And unknown cost is not replaced with zero

  @V2_SALE_003
  Scenario: Choose from two purchases before saving a partial sale
    Given Redwood Brokerage has cash "$1,000.00" and 15 HOME shares priced at "$120.00" on "2026-09-10"
    And purchase A contains 10 shares costing "$1,000.00" and purchase B contains 5 shares costing "$550.00"
    When Sam records a sale of 6 shares at "$120.00" without a fee dated "2026-09-15"
    Then the review asks which purchased shares were sold and does not silently choose a purchase
    When Sam chooses 4 shares from purchase A and 2 from purchase B and saves
    Then cash becomes "$1,720.00" and 9 shares remain worth "$1,080.00", giving unchanged Balance "$2,800.00"
    And selected cost is "$620.00", known realized gain "$100.00" and remaining known cost "$930.00"

  @V2_SALE_004
  Scenario Outline: Reject an invalid sale or leave an unsaved sale canceled
    Given today is "2026-10-03" and Redwood Brokerage opened "2026-09-01" with cash "$500.00" and 5 HOME shares priced at "$100.00"
    When Maya enters <sale>
    Then the review explains <message> and no cash or share change is saved
    Examples:
      | sale | message |
      | 6 shares at "$100.00" dated "2026-09-10" | "Only 5 shares are available to sell" |
      | 0 shares at "$100.00" dated "2026-09-10" | "Enter more than zero shares" |
      | 1 share at "$0.00" dated "2026-09-10" | "Enter a sale price greater than zero" |
      | 1 share at "$100.00" with fee "$101.00" dated "2026-09-10" | "Fee exceeds the sale proceeds" |
      | 1 share at "$100.00" dated "2026-10-04" | "Save a future reminder instead of completed activity" |
      | 1 share at "$100.00" dated "2026-08-31" | "Review the earlier tracking start before saving" |

  @V2_SALE_005
  Scenario: Keep an incomplete sale entry as a draft until proceeds are received
    Given Redwood Brokerage has cash "$1,000.00" and 10 HOME shares at "$120.00" dated "2026-09-10", giving Balance "$2,200.00"
    When Maya starts recording a sale of 4 shares at "$120.00" with fee "$5.00" but cannot confirm received proceeds
    Then the entry stays a draft and account cash, shares and Balance remain unchanged
    And the account does not create a pending cash amount or claim money is available to withdraw
    When Maya confirms proceeds "$475.00" actually received on "2026-09-16" and saves the reviewed completed sale
    Then cash is "$1,475.00", 6 shares remain worth "$720.00" and Balance is "$2,195.00"
    And received proceeds and the fee are recorded once

  @V2_SALE_006
  Scenario: Cancel a reviewed sale without losing the selected purchase information
    Given Redwood Brokerage has cash "$1,000.00" and 10 HOME shares at "$120.00" dated "2026-09-10" with known purchase cost "$1,005.00"
    When Maya reviews selling 4 selected shares at "$120.00" with fee "$5.00" dated "2026-09-15" and cancels
    Then cash remains "$1,000.00", shares remain 10 and Balance remains "$2,200.00"
    And the purchase cost remains "$1,005.00" with no sale or realized gain recorded

  @V2_SALE_007
  Scenario: Keep known and unknown realized gain separate within one sale
    Given Redwood Brokerage has cash "$500.00" and 5 HOME shares at "$120.00" on "2026-09-10", giving Balance "$1,100.00"
    And 3 shares have known cost "$300.00" while 2 have unknown cost
    When Maya sells 2 known-cost shares and 1 unknown-cost share at "$120.00" each without fee on "2026-09-15" and saves
    Then cash is "$860.00", 2 shares remain worth "$240.00" and Balance stays "$1,100.00"
    And the known-cost portion shows proceeds "$240.00", selected cost "$200.00" and known realized gain "$40.00"
    And the other share's realized gain and the whole sale's realized gain say "Not available"
    And remaining shares have known cost "$100.00" for 1 share and unknown cost for 1 share
