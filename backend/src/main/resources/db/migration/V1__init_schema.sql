CREATE SCHEMA IF NOT EXISTS wealthmesh;

CREATE TABLE wealthmesh.household (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    singleton BOOLEAN NOT NULL DEFAULT TRUE CHECK (singleton),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120 AND btrim(name) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (singleton)
);

CREATE TABLE wealthmesh.household_member (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES wealthmesh.household(id),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120 AND btrim(name) <> ''),
    label TEXT CHECK (label IS NULL OR (length(label) BETWEEN 1 AND 80 AND btrim(label) <> '')),
    name_key TEXT NOT NULL CHECK (name_key <> ''),
    label_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (household_id, name_key, label_key),
    UNIQUE (household_id, id)
);
