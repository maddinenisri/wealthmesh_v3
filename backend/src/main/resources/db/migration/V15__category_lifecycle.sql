-- Slice 10 group 2 (CATEGORIES_002 to 005): archive, restore, rename and merge. An archived category is hidden from
-- new choices and keeps its entries. A merge is a pointer, not a rewrite (ledger rows are never touched): the
-- sources are archived and point at the target, and every reader resolves COALESCE(merged_into_id, id). Undo clears
-- the pointer on every source of one merge_id.
ALTER TABLE wealthmesh.category
    ADD COLUMN archived_at TIMESTAMPTZ,
    ADD COLUMN merged_into_id UUID REFERENCES wealthmesh.category(id),
    ADD COLUMN merge_id UUID,
    ADD CONSTRAINT category_merge_is_archived CHECK (merged_into_id IS NULL OR archived_at IS NOT NULL),
    ADD CONSTRAINT category_merge_has_id CHECK ((merged_into_id IS NULL) = (merge_id IS NULL)),
    ADD CONSTRAINT category_not_merged_into_self CHECK (merged_into_id IS NULL OR merged_into_id <> id);

CREATE INDEX category_merged_into_idx ON wealthmesh.category (merged_into_id) WHERE merged_into_id IS NOT NULL;
