-- Who owns an account is changed by a reviewed owner correction (slice 18c, Q-064) or, for a type with no history of
-- its own, by the plain Edit account. Both add one 'owner_changed' row: `detail` holds "Sam → Maya" (the owners before
-- and after, as named at the time) so the previous owner stays in the account's history. No money moves.
ALTER TABLE wealthmesh.account_event DROP CONSTRAINT account_event_action_check;
ALTER TABLE wealthmesh.account_event ADD CONSTRAINT account_event_action_check CHECK (action IN (
    'archived', 'restored', 'closed', 'reopened', 'deleted', 'undeleted', 'discarded', 'setup_finished',
    'set_up', 'drafted', 'renamed', 'owner_changed'));
