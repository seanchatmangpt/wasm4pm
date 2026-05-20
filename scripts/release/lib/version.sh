#!/usr/bin/env bash
set -euo pipefail

# lib/version.sh - Shared version utility for release scripts

pkg_version() {
  node -p "require('./package.json').version"
}

release_version() {
  local requested="${1:-}"
  local pkg
  pkg="$(pkg_version)"

  if [[ -n "$requested" && "$requested" != "$pkg" ]]; then
    echo "ERROR: requested release version $requested does not match package.json $pkg" >&2
    exit 1
  fi

  echo "$pkg"
}
