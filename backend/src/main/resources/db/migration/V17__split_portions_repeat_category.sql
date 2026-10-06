-- A merge can leave two portions of one payment in the same category (Groceries 90 and Gifts 30 after Gifts is merged
-- into Groceries), and a correction sends them back. So a split may hold a category more than once; the portions add up.
DROP INDEX wealthmesh.activity_portion_category_once;
