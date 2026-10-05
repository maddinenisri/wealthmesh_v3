-- Slice 07: a transfer is two activity rows sharing one movement_id (foundations 7). Card payments (slice 08) reuse it.
-- Transfer rows must name their movement; at most one live row of each side per movement, so a pair cannot be
-- half-written even by a writer that skips the service.
ALTER TABLE wealthmesh.activity ADD CONSTRAINT activity_transfer_has_movement
    CHECK (kind NOT IN ('transfer_in', 'transfer_out') OR movement_id IS NOT NULL);
CREATE INDEX activity_movement_idx ON wealthmesh.activity (movement_id) WHERE movement_id IS NOT NULL;
CREATE UNIQUE INDEX activity_movement_side_live ON wealthmesh.activity (movement_id, kind)
    WHERE movement_id IS NOT NULL AND removed_at IS NULL;
