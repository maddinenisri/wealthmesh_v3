#!/usr/bin/env bash
# Shows which requirement scenarios have a test. A scenario is covered when its ID (for example
# V2_HOUSEHOLD_SETUP_001) appears anywhere in the test sources.
#
#   scripts/scenario-coverage.sh [--require] [--slice NN] [filter]
#
# filter   substring of a feature file path, e.g. household/setup (default: every feature file)
# --slice NN  check only the IDs of session NN in docs/features/slices.txt (a slice spans files, so no filter applies).
#             NN also covers its lettered parts (01a, 01b); --slice 01a covers that part only
# --require  exit 1 if any scenario in the matched files is neither covered nor deferred
#
# Deferred scenarios are listed in docs/features/deferred.txt as "<ID> <reason>".
# Overrides (used by the self-test): WM_SLICES_FILE, WM_REQUIREMENTS_DIR, WM_TEST_DIRS (space separated), WM_DEFERRED_FILE.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
req="${WM_REQUIREMENTS_DIR:-$root/docs/requirements/v2}"
slices_file="${WM_SLICES_FILE:-$root/docs/features/slices.txt}"
deferred_file="${WM_DEFERRED_FILE:-$root/docs/features/deferred.txt}"
read -r -a test_dirs <<<"${WM_TEST_DIRS:-$root/backend/src/test $root/frontend/src $root/e2e/tests}"

require=0
filter=""
slice=""
while [ $# -gt 0 ]; do
  case "$1" in
    --require) require=1 ;;
    --slice)
      [ $# -ge 2 ] || { echo "--slice needs a number, e.g. --slice 01" >&2; exit 2; }
      slice="$2"
      shift
      ;;
    *) filter="$1" ;;
  esac
  shift
done

is_covered() { grep -rqwF --exclude-dir=node_modules -- "$1" "${test_dirs[@]}" 2>/dev/null; }
is_deferred() { [ -f "$deferred_file" ] && grep -qE "^$1([[:space:]]|$)" "$deferred_file"; }

# One slice: report its IDs from slices.txt, whichever feature files they live in.
if [ -n "$slice" ]; then
  ids="$(awk -v n="$slice" '$1 == n || $1 ~ ("^" n "[a-z]$") { for (i = 2; i <= NF; i++) print $i }' "$slices_file" 2>/dev/null || true)"
  if [ -z "$ids" ]; then
    echo "No slice $slice in $slices_file" >&2
    exit 2
  fi
  total=0 covered=0 deferred=0 missing=""
  for id in $ids; do
    total=$((total + 1))
    if is_covered "$id"; then
      covered=$((covered + 1))
    elif is_deferred "$id"; then
      deferred=$((deferred + 1))
    else
      missing="$missing $id"
    fi
  done
  uncovered=$((total - covered - deferred))
  printf 'slice %s: %d/%d covered' "$slice" "$covered" "$total"
  [ "$deferred" -gt 0 ] && printf ', %d deferred' "$deferred"
  [ "$uncovered" -gt 0 ] && printf ', %d MISSING' "$uncovered"
  printf '\n'
  for id in $missing; do printf '    missing: %s\n' "$id"; done
  if [ "$require" -eq 1 ] && [ "$uncovered" -gt 0 ]; then
    exit 1
  fi
  exit 0
fi

total_all=0 covered_all=0 deferred_all=0 uncovered_all=0
while IFS= read -r feature; do
  rel="${feature#"$req"/}"
  case "$rel" in *"$filter"*) ;; *) continue ;; esac
  ids="$(grep -oE '@V2_[A-Za-z0-9_]+' "$feature" | tr -d '@' | sort -u || true)"
  total=0 covered=0 deferred=0 missing=""
  for id in $ids; do
    total=$((total + 1))
    if is_covered "$id"; then
      covered=$((covered + 1))
    elif is_deferred "$id"; then
      deferred=$((deferred + 1))
    else
      missing="$missing $id"
    fi
  done
  uncovered=$((total - covered - deferred))
  printf '%-58s %3d/%d covered' "$rel" "$covered" "$total"
  [ "$deferred" -gt 0 ] && printf ', %d deferred' "$deferred"
  [ "$uncovered" -gt 0 ] && printf ', %d MISSING' "$uncovered"
  printf '\n'
  if [ -n "$filter" ] && [ -n "$missing" ]; then
    for id in $missing; do printf '    missing: %s\n' "$id"; done
  fi
  total_all=$((total_all + total))
  covered_all=$((covered_all + covered))
  deferred_all=$((deferred_all + deferred))
  uncovered_all=$((uncovered_all + uncovered))
done < <(find "$req" -name '*.feature' | sort)

printf 'TOTAL: %d/%d covered, %d deferred, %d missing\n' "$covered_all" "$total_all" "$deferred_all" "$uncovered_all"
if [ "$require" -eq 1 ] && [ "$uncovered_all" -gt 0 ]; then
  exit 1
fi
