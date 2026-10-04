#!/usr/bin/env bash
# Tests scripts/run-backend-jar.sh without starting Spring: a fake JDK 25 stands in for java and
# small jars stand in for the real one. Usage: scripts/test-run-backend-jar.sh [script-to-test]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
script_name="$(basename "${1:-$here/run-backend-jar.sh}")"
script_src="$(cd "$(dirname "${1:-$here/run-backend-jar.sh}")" && pwd)/$script_name"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/scripts" "$work/backend/build/libs" "$work/jdk/bin" "$work/jar-ui/BOOT-INF/classes/static" "$work/jar-bare"

cp "$here/java-env.sh" "$work/scripts/java-env.sh"
cp "$script_src" "$work/scripts/run-backend-jar.sh"
cat > "$work/jdk/bin/java" <<'JAVA'
#!/usr/bin/env bash
if [ "${1:-}" = "-version" ]; then echo 'openjdk version "25.0.0"' >&2; else echo "FAKE-JAVA $*"; fi
JAVA
chmod +x "$work/jdk/bin/java" "$work/scripts/"*.sh

# index.html first and many entries after it, so `unzip | grep -q` exits early and unzip gets SIGPIPE.
echo '<div id="root"></div>' > "$work/jar-ui/BOOT-INF/classes/static/index.html"
for i in $(seq 1 2000); do echo x > "$work/jar-ui/BOOT-INF/classes/filler-$i.class"; done
echo x > "$work/jar-bare/BOOT-INF-classes-only.txt"

make_jar() { # <source dir> <jar name>
  rm -f "$work/backend/build/libs/"*.jar
  (cd "$1" && zip -qr -X "$work/backend/build/libs/$2" .)
  (cd "$work/backend/build/libs" && cp "$2" "${2%.jar}-plain.jar") # the runner must skip -plain jars
}

run() { # [env assignments...]; sets $out and $code
  set +e
  out="$(env WM_JAVA_HOME="$work/jdk" "$@" "$work/scripts/run-backend-jar.sh" 2>&1)"
  code=$?
  set -e
}

failures=0
check() { # <description> <condition result: 0 = ok>
  if [ "$2" -eq 0 ]; then echo "ok   $1"; else echo "FAIL $1"; echo "     output: $out"; failures=$((failures + 1)); fi
}

make_jar "$work/jar-ui" app.jar
for attempt in 1 2 3 4 5; do
  run WM_REQUIRE_UI=1
  [ "$code" -eq 0 ] && grep -q "FAKE-JAVA -jar .*app.jar" <<<"$out" && ok=0 || ok=1
  check "UI required, jar has UI: runs the jar (attempt $attempt)" "$ok"
done
grep -q -- "-plain.jar" <<<"$out" && ok=1 || ok=0
check "the -plain jar is skipped" "$ok"

make_jar "$work/jar-bare" app.jar
run WM_REQUIRE_UI=1
[ "$code" -eq 1 ] && grep -q "no bundled UI" <<<"$out" && ok=0 || ok=1
check "UI required, jar has no UI: refuses with a message" "$ok"

run WM_REQUIRE_UI=0
[ "$code" -eq 0 ] && grep -q "FAKE-JAVA" <<<"$out" && ok=0 || ok=1
check "UI not required, jar has no UI: runs anyway" "$ok"

rm -f "$work/backend/build/libs/"*.jar
run WM_REQUIRE_UI=1
[ "$code" -eq 1 ] && grep -q "No backend jar found" <<<"$out" && ok=0 || ok=1
check "no jar built: explains how to build one" "$ok"

if [ "$failures" -eq 0 ]; then
  echo "all passed"
else
  echo "$failures failed"
  exit 1
fi
