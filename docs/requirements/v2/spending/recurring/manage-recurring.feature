Feature: Manage recurring estimates without recording bills automatically
  A recurring estimate is a schedule and expected amount, not a completed expense.
  Maya and Sam can review suggestions or create weekly, monthly and yearly schedules manually.
  The examples use USD. Removing an estimate never removes a paid bill.

  @V2_RECURRING_001
  Scenario: Inspect three bills supporting a monthly suggestion
    Given Maya has Electricity expenses "$180.00" on "2026-07-05", "2026-08-05" and "2026-09-05" paid from checking
    When she opens the monthly Electricity suggestion
    Then she sees expected "$180.00", last recorded bill "2026-09-05" and next expected bill "2026-10-05"
    And she can inspect each of the three supporting bills
    And it says "Estimate, not a recorded expense" with no promise that every repeated purchase can be detected
    And September still has only its original "$180.00" Electricity expense

  @V2_RECURRING_002
  Scenario: Confirm a suggested schedule without paying its next bill
    Given Electricity bills "$180.00" were recorded on "2026-07-05", "2026-08-05" and "2026-09-05"
    And October has no actual expenses and checking Balance is "$4,820.00"
    When Maya reviews and confirms the monthly "$180.00" estimate with next due date "2026-10-05"
    Then the recurring list shows that expected amount and due date, with access to the supporting bills
    And checking Balance remains "$4,820.00" and October spending "$0.00"

  @V2_RECURRING_003
  Scenario: Record an early payment against its scheduled occurrence
    Given checking started with "$5,000.00" on "2026-09-01" and has only Electricity "$180.00" paid on "2026-09-05"
    And a saved monthly Electricity estimate "$180.00" is due "2026-10-05"
    When Sam chooses Record actual expense for that October 5 occurrence
    And he reviews checking, Utilities, actual amount "$180.00" and early payment date "2026-09-30"
    Then nothing changes until he confirms
    When he confirms saving
    Then checking Balance is "$4,640.00" and September Utilities spending "$360.00" from two actual bills on their own dates
    And the October 5 occurrence is marked paid early on September 30
    And the next scheduled occurrence is "2026-11-05", not October 30
    And October actual spending stays "$0.00"

  @V2_RECURRING_004
  Scenario: Cancel actual payment while preserving its unpaid occurrence
    Given checking started with "$5,000.00" on "2026-09-01" and has only Electricity "$180.00" paid on "2026-09-05"
    And a saved monthly Electricity estimate "$180.00" is due "2026-10-05"
    When Maya reviews an early "$180.00" payment dated "2026-09-30" but cancels
    Then checking Balance stays "$4,820.00", September spending "$180.00" and the October 5 occurrence stays unpaid
    And no expense or changed due date is saved

  @V2_RECURRING_005
  Scenario: Reject a negative estimate and cancel a corrected amount
    Given a monthly Electricity estimate is "$180.00" due "2026-10-05" and its supporting July, August and September bills are each "$180.00"
    When Sam enters an estimate "-$180.00" and tries to save
    Then Amount says "Enter an amount greater than zero" and the saved estimate and earlier bills stay unchanged
    When he enters "$200.00" but cancels
    Then the expected amount remains "$180.00" with no actual expense added

  @V2_RECURRING_006
  Scenario Outline: Create a manual recurring schedule with an explicit due date
    Given today is "2026-09-30" and Maya has no Gym membership schedule or actual Gym expense
    And checking Balance is "$5,000.00"
    When she creates Gym membership expected amount "<amount>" paid from checking, frequency "<frequency>" and first due date "<due>"
    And she reviews and saves the schedule
    Then the recurring list shows "<frequency>", "<amount>" and next due date "<due>"
    And its following expected occurrence is "<following>"
    And checking Balance remains "$5,000.00" and spending "$0.00"

    Examples:
      | amount | frequency | due | following |
      | $45.00 | Weekly | 2026-10-09 | 2026-10-16 |
      | $180.00 | Monthly | 2026-10-05 | 2026-11-05 |
      | $120.00 | Yearly | 2026-10-20 | 2027-10-20 |

  @V2_RECURRING_007
  Scenario: Change future estimates without changing previously paid bills
    Given Electricity "$180.00" was paid on "2026-09-05" and its saved monthly estimate is "$180.00" due "2026-10-05"
    When Maya reviews changing the estimate to "$200.00", Weekly, first due "2026-10-09" and confirms
    Then future occurrences show "$200.00" on October 9, October 16 and later Fridays
    And the earlier bill stays "$180.00" dated September 5 with its original account and category
    And September actual spending and account Balance remain unchanged

  @V2_RECURRING_008
  Scenario: Pause and resume a schedule without recording missed payments
    Given a monthly Electricity schedule expects "$180.00" on the fifth and has a paid September 5 bill
    When Sam pauses it before October 5
    Then it is labeled Paused and does not create an October expense or active payment reminder
    When he resumes it and explicitly reviews next due date "2026-11-05"
    Then it shows Active, expected "$180.00" due November 5
    And October has no invented payment and the paid September bill remains unchanged

  @V2_RECURRING_009
  Scenario: Dismiss a suggestion and delete a saved estimate without removing bills
    Given Electricity "$180.00" was paid on July 5, August 5 and September 5, 2026
    And a suggested monthly Electricity estimate awaits review
    When Maya dismisses the suggestion
    Then it leaves the suggestions list and all three actual bills remain
    When she manually creates the same monthly estimate due "2026-10-05" and later confirms deleting that estimate
    Then the schedule no longer appears and no future reminders are created from it
    And all three paid bills remain inspectable with their original dates and amounts

  @V2_RECURRING_010
  Scenario: Show overdue status without posting an expense
    Given today is "2026-10-07" and an unpaid monthly Electricity occurrence "$180.00" was due "2026-10-05"
    And checking Balance is "$5,000.00" with no October expenses
    When Sam reviews recurring bills
    Then Electricity says "Overdue by 2 days" and offers Record actual expense, reschedule or dismiss this occurrence
    And checking Balance remains "$5,000.00" and October actual spending "$0.00"
    When he dismisses just that occurrence
    Then no expense is created and the monthly schedule still has its next occurrence "2026-11-05"
