# UI checklist for the Cowork pass

Paste this with the builder's "what to click" list. Cowork (or the owner) walks the running app at 710px and 1280px
and reports a table: check, result, and for each fault what was seen. Each fault becomes an e2e assertion that fails
before the fix (a Cowork finding is a missing test).

1. The top of every panel or review that opens is in view, and focus is inside it.
2. Cancel returns focus to the button that opened the panel and changes nothing.
3. A bad value keeps what was typed, and the first error is in view, next to its field.
4. Long names, labels and notes wrap; nothing is cut off, and no table description becomes a tall narrow column.
5. Tables that scroll sideways inside a card are noted (the page itself must not scroll sideways).
6. The same figure matches on every screen that shows it (account card, list, Household card, Spending).
7. Anything new that tells accounts or entries apart (type, status, owner) is visible in the lists.
8. The history of every account involved shows the change, who made it and when.
9. Say what was left in the dev data.
