#!/usr/bin/env bash
# Self-test for scripts/scenario-coverage.sh using a throwaway requirements tree and test tree.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/req/household/setup" "$work/req/spending" "$work/tests"

cat > "$work/req/household/setup/a.feature" <<'FEATURE'
Feature: A
  @V2_A_001
  Scenario: one
  @V2_A_0010
  Scenario: ten
  @V2_A_002
  Scenario: two
FEATURE
cat > "$work/req/spending/b.feature" <<'FEATURE'
Feature: B
  @V2_B_001
  Scenario: only
FEATURE
: > "$work/deferred.txt"

failures=0
run() { # <args...> ; sets out and code
  set +e
  out="$(WM_REQUIREMENTS_DIR="$work/req" WM_TEST_DIRS="$work/tests" WM_DEFERRED_FILE="$work/deferred.txt" \
    "$here/scenario-coverage.sh" "$@" 2>&1)"
  code=$?
  set -e
}
expect() { # <description> <condition exit status>
  if [ "$2" -eq 0 ]; then
    echo "ok   $1"
  else
    echo "FAIL $1"
    while IFS= read -r line; do echo "     $line"; done <<<"$out"
    failures=$((failures + 1))
  fi
}

run
grep -q "household/setup/a.feature  *0/3 covered, 3 MISSING" <<<"$out" && s=0 || s=1
expect "nothing cited: every scenario is missing" "$s"

echo '// V2_A_0010 is cited here' > "$work/tests/t.test.ts"
run household/setup
grep -q "1/3 covered, 2 MISSING" <<<"$out" && s=0 || s=1
expect "V2_A_0010 does not cover V2_A_001 (whole-token match)" "$s"
grep -q "missing: V2_A_001$" <<<"$out" && grep -q "missing: V2_A_002$" <<<"$out" && s=0 || s=1
expect "a filter lists the missing IDs" "$s"

run --require household/setup
[ "$code" -eq 1 ] && s=0 || s=1
expect "--require fails while IDs are missing" "$s"

printf 'V2_A_001 waiting on accounts\n' > "$work/deferred.txt"
echo '// V2_A_002' >> "$work/tests/t.test.ts"
run --require household/setup
[ "$code" -eq 0 ] && grep -q "2/3 covered, 1 deferred" <<<"$out" && s=0 || s=1
expect "deferred IDs are reported and do not fail --require" "$s"

run spending
grep -q "household" <<<"$out" && s=1 || s=0
expect "the filter hides other features" "$s"

if [ "$failures" -eq 0 ]; then echo "all passed"; else echo "$failures failed"; exit 1; fi
