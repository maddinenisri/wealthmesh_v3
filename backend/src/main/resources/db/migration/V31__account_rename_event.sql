-- A plain Edit account that renames the account adds a history row (slice 18b, Q-062): 'renamed' with the name it
-- replaced in `detail`. No money moves. Owner changes get their own history in slice 18c.
ALTER TABLE wealthmesh.account_event ADD COLUMN detail TEXT;
ALTER TABLE wealthmesh.account_event DROP CONSTRAINT account_event_action_check;
ALTER TABLE wealthmesh.account_event ADD CONSTRAINT account_event_action_check CHECK (action IN (
    'archived', 'restored', 'closed', 'reopened', 'deleted', 'undeleted', 'discarded', 'setup_finished',
    'set_up', 'drafted', 'renamed'));
