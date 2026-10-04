Feature: Record retirement funding and health spending in the household journey
  Account contributions are funding; HSA medical spending is a household expense counted once.

  @V2_RETIREMENT_ACTIVITY_001
  Scenario: Record take-home pay, employee funding and employer match separately
    Given Everyday Checking starts "2026-09-01" with Balance "$5,000.00"
    And Harbor 401k starts that date with cash "$60,000.00" and 200 HOME shares at "$100.00", giving Balance "$80,000.00"
    When Sam records actual take-home salary "$4,000.00" into checking dated "2026-09-15"
    And records actual employee contribution "$600.00" and employer match "$300.00" into Harbor 401k cash on that date
    And saves their reviewed explanations
    Then checking Balance is "$9,000.00" and 401k cash is "$60,900.00" with Balance "$80,900.00"
    And bank income is "$4,000.00" and retirement funding is "$900.00", separated into employee "$600.00" and employer "$300.00"
    And no "$600.00" checking withdrawal, fictional gross salary or salary expense is created
    When Sam records HOME price "$101.00" dated "2026-09-30" and reviews complete cash and holdings
    Then 401k Balance is "$81,100.00" and September earnings are "$200.00" with simple period return "0.25%"
    And the wealth change explanation separates retained bank income "$4,000.00", retirement funding "$900.00" and investment earnings "$200.00"

  @V2_RETIREMENT_ACTIVITY_002
  Scenario: Keep a promised employer contribution out of current Balance
    Given Harbor 401k has cash "$60,000.00" and 200 HOME shares at "$100.00" dated "2026-09-01"
    When Sam records a reminder for expected employer match "$300.00" due "2026-10-15" while today is "2026-10-03"
    Then current Balance remains "$80,000.00" and the expected amount is labeled as a reminder
    When today is "2026-10-15" and Sam records the actual received "$300.00" after it arrives
    Then cash becomes "$60,300.00" and Balance "$80,300.00" with employer funding "$300.00" once
    And the completed reminder links to the actual contribution

  @V2_RETIREMENT_ACTIVITY_003
  Scenario: Pay a medical expense directly from HSA cash
    Given Meadow HSA starts "2026-09-01" with cash "$1,050.00" and 20 CARE shares at "$100.00", giving Balance "$3,050.00"
    When Maya records an actual doctor payment "$150.00" from HSA cash dated "2026-09-15" categorized "Healthcare" and saves
    Then cash is "$900.00" and Balance is "$2,900.00"
    And household healthcare spending includes "$150.00" once
    And HSA performance shows outgoing funding "$150.00" and earnings "$0.00" at unchanged prices
    And the payment can retain a receipt and stated medical purpose without an automatic eligibility judgment

  @V2_RETIREMENT_ACTIVITY_004
  Scenario: Reimburse a checking-paid medical expense without counting spending twice
    Given Everyday Checking starts "2026-09-01" with Balance "$5,000.00"
    And Meadow HSA starts that date with cash "$1,050.00" and 20 CARE shares at "$100.00", giving Balance "$3,050.00"
    When Maya records doctor expense "$150.00" paid from checking dated "2026-09-10"
    And records a confirmed "$150.00" HSA-to-checking reimbursement dated "2026-09-15" linked to that expense
    And saves the reviewed movement
    Then checking Balance is "$5,000.00", HSA cash "$900.00" and HSA Balance "$2,900.00"
    And household healthcare spending is "$150.00", reimbursement income is "$0.00" and no second medical expense is created
    And the original expense date remains September 10 while the reimbursement date remains September 15
    And HSA performance treats "$150.00" as outgoing funding rather than investment loss

  @V2_RETIREMENT_ACTIVITY_005
  Scenario: Reimburse an earlier month's expense without moving its spending date
    Given checking Balance is "$5,000.00" and Meadow HSA has cash "$1,050.00" plus holdings "$2,000.00" dated "2026-09-01"
    And a doctor expense "$150.00" was already recorded in August and is not included again in those September opening amounts
    When Maya records an actual HSA reimbursement "$150.00" into checking dated "2026-09-15" linked to that August expense and saves
    Then checking Balance is "$5,150.00" and HSA Balance "$2,900.00"
    And September spending and income do not gain a new "$150.00" item
    And August healthcare spending keeps its original expense and date

  @V2_RETIREMENT_ACTIVITY_006
  Scenario: Sell HSA shares before a medical payment when cash is insufficient
    Given Meadow HSA has cash "$100.00" and 10 CARE shares priced at "$100.00" dated "2026-09-01"
    When Maya reviews a doctor payment "$150.00" dated "2026-09-15"
    Then the review explains cash is "$50.00" short and the payment cannot be saved yet
    When Maya records a settled sale of 1 CARE share at "$100.00" with no fee on that date
    And repeats and saves the "$150.00" doctor payment
    Then cash is "$50.00", 9 CARE shares are worth "$900.00" and Balance is "$950.00"
    And healthcare spending is "$150.00" and the sale itself is not a household expense or contribution

  @V2_RETIREMENT_ACTIVITY_007
  Scenario: Keep Roth IRA and HSA group membership explicit
    Given the household's only accounts on "2026-09-30" are Willow Roth IRA cash "$1,000.00" plus 50 HOME shares at "$100.00"
    And Meadow HSA cash "$1,050.00" plus 20 CARE shares at "$100.00"
    When Maya opens household groups
    Then total assets and investment accounts each show "$9,050.00"
    And Retirement includes Roth IRA "$6,000.00" while Health savings includes HSA "$3,050.00"
    And HSA is not automatically added to Retirement or Bank money
    And overlapping group totals are not added again to household wealth
