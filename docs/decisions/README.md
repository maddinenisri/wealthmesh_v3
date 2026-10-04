# Decisions and questions

Two short tables, kept current by whoever learns something.

- [decisions.md](decisions.md): choices that affect more than one feature or the way we work. One row each.
- [questions.md](questions.md): things waiting on the product owner. An open question blocks only work that depends
  on its answer; do not stall on the rest.

Rules:

- A choice that affects a single feature stays in that feature's notes. Promote it here only when other features
  will rely on it.
- Rows are added, never rewritten. To change a decision, add a new row that supersedes the old one and mark the old
  row's "Status" as `superseded by D-nnn`.
- Resolving a question: fill in the answer and date, and link the decision row it produced.
- No inferred approval. A decision needs a recorded answer from the product owner or a rule in `AGENTS.md`.
