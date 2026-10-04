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
  out="$(WM_REQUIREMENTS_DIR="$work/req" WM_TEST_DIRS="$work/tests" WM_DEFERRED_FILE="$work/deferred.txt" WM_SLICES_FILE="$work/slices.txt" \
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

# Slices span files: IDs from two features in one slice.
printf '# comment\n01 V2_A_001 V2_B_001\n02 V2_A_0010 V2_A_002\n' > "$work/slices.txt"
: > "$work/deferred.txt"
: > "$work/tests/t.test.ts"
echo '// V2_B_001' > "$work/tests/t.test.ts"
run --slice 01
grep -q "slice 01: 1/2 covered, 1 MISSING" <<<"$out" && grep -q "missing: V2_A_001$" <<<"$out" && s=0 || s=1
expect "--slice counts IDs across feature files and lists the missing one" "$s"

run --require --slice 01
[ "$code" -eq 1 ] && s=0 || s=1
expect "--require --slice fails while the slice has missing IDs" "$s"

echo '// V2_A_001' >> "$work/tests/t.test.ts"
run --require --slice 01
[ "$code" -eq 0 ] && grep -q "slice 01: 2/2 covered" <<<"$out" && s=0 || s=1
expect "--require --slice passes when every ID of the slice is covered" "$s"

run --slice 02
grep -q "slice 02: 0/2 covered, 2 MISSING" <<<"$out" && s=0 || s=1
expect "another slice is judged only by its own IDs" "$s"

run --slice 99
[ "$code" -eq 2 ] && s=0 || s=1
expect "an unknown slice is an error, not a pass" "$s"

# A slice may be split into lettered parts (03a, 03b). The number covers every part; a part covers only itself.
printf '03a V2_A_001\n03b V2_B_001 V2_A_002\n031 V2_A_0010\n' > "$work/slices.txt"
echo '// V2_A_001' > "$work/tests/t.test.ts"
run --slice 03
grep -q "slice 03: 1/3 covered, 2 MISSING" <<<"$out" && s=0 || s=1
expect "--slice 03 covers its parts 03a and 03b, not slice 031" "$s"

run --slice 03a
grep -q "slice 03a: 1/1 covered" <<<"$out" && s=0 || s=1
expect "--slice 03a covers only its own IDs" "$s"

run --require --slice 03b
[ "$code" -eq 1 ] && grep -q "missing: V2_B_001$" <<<"$out" && s=0 || s=1
expect "--require fails for an unfinished part" "$s"

run --slice 03c
[ "$code" -eq 2 ] && s=0 || s=1
expect "an unknown part is an error, not a pass" "$s"

# Slice mode honours deferred IDs, and the slice argument is a literal, not a pattern.
printf '04 V2_A_001 V2_A_002 V2_B_001\n' > "$work/slices.txt"
printf 'V2_A_002 waiting\n' > "$work/deferred.txt"
echo '// V2_A_001' > "$work/tests/t.test.ts"
run --slice 04
grep -q "slice 04: 1/3 covered, 1 deferred, 1 MISSING" <<<"$out" && s=0 || s=1
expect "--slice reports a deferred ID separately from a missing one" "$s"

echo '// V2_B_001' >> "$work/tests/t.test.ts"
run --require --slice 04
[ "$code" -eq 0 ] && grep -q "slice 04: 2/3 covered, 1 deferred" <<<"$out" && s=0 || s=1
expect "--require --slice passes when the rest is deferred" "$s"

printf 'V2_A_002 waiting\nV2_B_001 also waiting\n' > "$work/deferred.txt"
echo '// nothing' > "$work/tests/t.test.ts"
echo '// V2_A_001' >> "$work/tests/t.test.ts"
run --require --slice 04
[ "$code" -eq 0 ] && s=0 || s=1
expect "--require --slice counts every deferred ID, not only the first" "$s"
: > "$work/deferred.txt"

printf '03a V2_A_001\n03b V2_B_001\n' > "$work/slices.txt"
for pat in '0.' '0[3]' '0*' '.'; do
  run --slice "$pat"
  [ "$code" -eq 2 ] && s=0 || s=1
  expect "--slice '$pat' is not a pattern" "$s"
done

run --slice 03a 03b
[ "$code" -eq 2 ] && s=0 || s=1
expect "a second argument with --slice is an error, not ignored" "$s"

if [ "$failures" -eq 0 ]; then echo "all passed"; else echo "$failures failed"; exit 1; fi
