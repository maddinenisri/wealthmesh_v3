Feature: Add a card with one Balance that means debt or Card credit
  Maya and Sam enter a positive amount and choose Owed or Card credit for the one Balance.
  A blank new card Balance starts at $0.00 on its setup date; saving confirms the setup.
  Account details and dated Balance updates are separate actions. These examples use USD.

  @V2_CARD_001
  Scenario: Create a card with debt and open its detail
    Given Maya has no card account in the household
    When she creates Everyday Credit Card at Harbor Cards, owned by Maya, on "2026-09-01"
    And she enters Balance "$1,000.00", chooses Owed and saves
    Then the account list and detail show "$1,000.00 owed" with the same issuer, owner and date
    And its activity is empty with actions to record a purchase, refund or payment
    And the initial debt is not September spending

  @V2_CARD_002
  Scenario Outline: Create a card at zero without an extra confirmation step
    Given Sam is adding Everyday Credit Card on "2026-09-01"
    When he chooses "<choice>" for Balance and saves
    Then the list and detail show "$0.00 owed" dated "2026-09-01" with no activity
    When he records a "$100.00" Groceries purchase on "2026-09-10"
    Then its only Balance is "$100.00 owed" and September Groceries spending is "$100.00"

    Examples:
      | choice |
      | leave Balance blank |
      | enter Balance $0.00 |

  @V2_CARD_003
  Scenario: Create a card with a credit instead of debt
    Given Maya is adding Rewards Credit Card on "2026-09-01"
    When she enters Balance "$50.00", chooses Card credit and saves
    Then list and detail show "$50.00 Card credit", not debt
    And wealth includes the "$50.00" as an asset separate from other cards' debt
    And the initial credit is not Income or a recorded shopping refund

  @V2_CARD_004
  Scenario: Edit card details separately from its Balance
    Given Everyday Credit Card belongs to Maya at Harbor Cards with Balance "$1,000.00 owed" dated "2026-09-01"
    When Sam edits its name to Household Card, owner to Sam and issuer to Harbor Credit Union and saves
    Then the list and detail show those details and the same "$1,000.00 owed" Balance
    And changing money uses Update balance with amount and date rather than Edit account

  @V2_CARD_005
  Scenario: Explain a missing account name and allow cancellation
    Given Maya has no card account
    When she enters Harbor Cards and Balance "$1,000.00 owed" for "2026-09-01" but leaves Name blank and saves
    Then she sees "Enter an account name" and her issuer, Balance and date remain entered
    When she supplies Everyday Credit Card but cancels
    Then no card or debt is added

  @V2_CARD_014
  Scenario: Explain an invalid initial amount
    Given Sam is adding Everyday Credit Card on "2026-09-01"
    When he types "one thousand" in Balance and tries to save
    Then Balance says "Enter a valid amount" and no account appears
    When he replaces it with "$1,000.00", chooses Owed and saves
    Then the one card Balance is "$1,000.00 owed"
