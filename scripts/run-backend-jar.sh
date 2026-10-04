#!/usr/bin/env bash
# Runs the built backend jar under JDK 25 (run `npm run backend:build` first).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=java-env.sh
. "$here/java-env.sh"
jar=""
for candidate in "$here"/../backend/build/libs/*.jar; do
  case "$candidate" in *-plain.jar) continue ;; esac
  [ -f "$candidate" ] && jar="$candidate" && break
done
if [ -z "$jar" ]; then
  echo "No backend jar found. Run: npm run backend:build" >&2
  exit 1
fi
# No pipe here: `unzip | grep -q` can die of SIGPIPE under pipefail and misreport a jar that has the UI.
if [ "${WM_REQUIRE_UI:-}" = "1" ] && ! unzip -l "$jar" 'BOOT-INF/classes/static/index.html' >/dev/null 2>&1; then
  echo "This jar has no bundled UI. Run: npm run package" >&2
  exit 1
fi
exec "$JAVA_HOME/bin/java" -jar "$jar"
