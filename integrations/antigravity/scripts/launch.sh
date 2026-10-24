#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 architect|implementer|business-reviewer|test-engineer|scout [agy args...]" >&2
  exit 2
fi
role="$1"
shift
case "$role" in
  architect) model="gemini-4-argon-high" ;;
  implementer|business-reviewer) model="gemini-3.8-flash-high" ;;
  test-engineer) model="gemini-3.8-flash-medium" ;;
  scout) model="gemini-3.8-flash-low" ;;
  *) echo "No exact launch profile for: $role" >&2; exit 2 ;;
esac
if ! command -v agy >/dev/null 2>&1; then
  echo "Antigravity CLI (agy) is not installed." >&2
  exit 127
fi
exec agy --agent "agad-$role" --model "$model" "$@"
