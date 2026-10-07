#!/usr/bin/env bash
# Repeats the full backend suite and keeps the first failing output of each run, so an unexplained failure is evidence
# and not a rerun that came back green (docs/guides/pitfalls.md #33).
#   scripts/flake-check.sh [runs] [outdir]     (default: 3 runs, ./flake-out)
# Run nothing else against Docker or Gradle meanwhile: an overlapping run is the one cause not yet ruled out.
set -uo pipefail
runs="${1:-3}"
out="${2:-flake-out}"
here="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$out"
failed=0
for i in $(seq 1 "$runs"); do
  "$here/scripts/gradle.sh" test >"$out/run$i.log" 2>&1
  python3 - "$here/backend/build/test-results/test" >"$out/failures$i.txt" <<'PY'
import glob, html, re, sys
total = failed = 0
for path in sorted(glob.glob(sys.argv[1] + '/*.xml')):
    text = open(path).read()
    m = re.search(r'tests="(\d+)" skipped="\d+" failures="(\d+)" errors="(\d+)"', text)
    total += int(m[1]); failed += int(m[2]) + int(m[3])
    for c in re.finditer(r'<testcase name="([^"]{0,120})[^>]*>\s*<failure message="(.{0,600})', text, re.S):
        print(path.split('TEST-')[-1][:60], '|', c.group(1), '|', html.unescape(c.group(2))[:600].replace('\n', ' '))
print('TOTAL', total, 'FAILED', failed)
PY
  rm -rf "$out/results$i"; cp -r "$here/backend/build/test-results/test" "$out/results$i" 2>/dev/null || true
  tail -1 "$out/failures$i.txt"
  grep -q 'FAILED 0$' "$out/failures$i.txt" || failed=$((failed + 1))
done
echo "runs with failures: $failed of $runs (details in $out)"
[ "$failed" -eq 0 ]
