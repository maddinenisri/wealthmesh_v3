-- INCOME_003 corrects Salary to Bonus; the read-only seeded list (D-020) gains the income category it names.
INSERT INTO wealthmesh.category (name, kind, sort_order) VALUES ('Bonus', 'income', 130);
