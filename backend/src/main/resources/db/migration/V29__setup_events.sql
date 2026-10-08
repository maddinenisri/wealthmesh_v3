-- Who set up an investment account and when (V2_BROKERAGE_002): a direct setup records one event, 'set_up' for an
-- active account and 'drafted' for a saved draft, by the member who entered it (not an owner).
ALTER TABLE wealthmesh.account_event DROP CONSTRAINT account_event_action_check;
ALTER TABLE wealthmesh.account_event ADD CONSTRAINT account_event_action_check CHECK (action IN (
    'archived', 'restored', 'closed', 'reopened', 'deleted', 'undeleted', 'discarded', 'setup_finished',
    'set_up', 'drafted'));
