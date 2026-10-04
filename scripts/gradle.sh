#!/usr/bin/env bash
# Runs the backend's Gradle wrapper under JDK 25: scripts/gradle.sh <gradle args>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=java-env.sh
. "$here/java-env.sh"
cd "$here/../backend"
exec ./gradlew --console=plain "$@"
