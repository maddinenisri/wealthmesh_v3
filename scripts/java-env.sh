# shellcheck shell=bash
# Sourced by the other scripts. Exports JAVA_HOME pointing at a JDK 25, because Gradle's
# toolchain (languageVersion 25) cannot see jenv or brew JDKs on its own.
# Tries, in order: WM_JAVA_HOME, JAVA_HOME, jenv, the macOS java_home helper.

is_jdk25() {
  [ -n "$1" ] && [ -x "$1/bin/java" ] && "$1/bin/java" -version 2>&1 | grep -q 'version "25'
}

find_jdk25() {
  local candidate
  for candidate in \
    "${WM_JAVA_HOME:-}" \
    "${JAVA_HOME:-}" \
    "$(jenv javahome 2>/dev/null || true)" \
    "$(/usr/libexec/java_home -v 25 2>/dev/null || true)"; do
    if is_jdk25 "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if ! JAVA_HOME="$(find_jdk25)"; then
  echo "JDK 25 not found. Install it and set WM_JAVA_HOME (or JAVA_HOME) to its home directory." >&2
  exit 1
fi
export JAVA_HOME
