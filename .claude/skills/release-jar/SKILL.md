---
name: release-jar
description: Use when producing or smoke-testing the single runnable jar that serves UI and API, or handing the app to someone to run locally
---

# Release jar

`npm run package` builds the React app and bundles it into the Spring Boot jar. `npm run backend:build` does not
(it skips the UI).

## Steps

1. `npm run package`; confirm the UI is inside: `unzip -l backend/build/libs/*SNAPSHOT.jar | grep static/index.html`.
2. `npm run db:up`, then run the jar on a spare port with the variables below.
3. Smoke test (all expected as shown):

| Request | Expect |
| --- | --- |
| `/` | 200, `text/html` |
| `/design` | the app shell (client route, not 404) |
| `/assets/<hashed file>.js` | 200, `text/javascript` |
| `/assets/nope.js` | 404 |
| `/api/v1/household` | 404 JSON with a message before a household exists |
| `/actuator/health` | `{"status":"UP"}` |

4. Stop the jar and `npm run db:reset`.

## What the customer needs

- JDK 25 and a PostgreSQL database (`backend/compose.yaml` works).
- Environment: `DB_PASSWORD`, `SPRING_R2DBC_URL`, `SPRING_FLYWAY_URL` (both pointing at the same database),
  optional `SERVER_PORT`; then `java -jar wealth-mesh-0.0.1-SNAPSHOT.jar` and open the port in a browser.

`WM_REQUIRE_UI=1` makes `scripts/run-backend-jar.sh` refuse a jar built without the UI.
