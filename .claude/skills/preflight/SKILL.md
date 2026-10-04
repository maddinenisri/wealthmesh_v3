---
name: preflight
description: Use when starting setup or a feature session on this repo, before installing or running anything, or when a command fails with a port, JDK, Docker, pm2 or version-mismatch error
---

# Preflight

Surface environment surprises in minutes, before they cost an hour. Run, then show a table with one row per check
(status and what you found).

## Checks

```sh
java -version; /usr/libexec/java_home -V; jenv versions      # real version behind each alias, not its name
node -v; npm -v; docker info >/dev/null && echo docker-ok
lsof -iTCP -sTCP:LISTEN -n -P | grep -E ':(5434|8081|5180|5173|5174|8080|5433)\b'
pm2 jlist | python3 -c 'import sys,json;print([p["name"] for p in json.load(sys.stdin)])'
git config user.name; git config user.email; git status --short | head
```

Registry versions (never from memory):

```sh
npm view react version; npm view vite version; npm view react-router version; npm outdated --prefix frontend
curl -s https://services.gradle.org/versions/current | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])'
curl -s https://start.spring.io/metadata/client | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["bootVersion"]["default"], [v["id"] for v in d["javaVersion"]["values"]])'
```

## Reading the results

| Finding | Action |
| --- | --- |
| Needed JDK missing, or an alias reports another version | `docs/guides/pitfalls.md` #10, #11 |
| A needed port is in use | Pick another and set it in `.env`; do not stop the other project's process |
| Other pm2 apps present | Leave them alone; keep `wm-*` names |
| A dependency is a major behind latest | State it and ask: upgrade now or keep |

## Gate

Every row is green, or each red row has an explicit decision from the user. Do not start installing before then.
