-- CARD_011: interest charged and an annual fee are spending categories, never bank Interest income.
-- The read-only seeded list (D-020) gains the two categories the scenario names.
INSERT INTO wealthmesh.category (name, kind, sort_order) VALUES
    ('Interest charged', 'spending', 105),
    ('Annual fee', 'spending', 106);
