#!/usr/bin/env bash
set -euo pipefail

# AGAD Claude Code Launcher
# Launches Claude Code with a specified AGAD agent persona (default: architect)

ROLE="${1:-architect}"
if [[ $# -ge 1 ]] && [[ "$1" =~ ^(architect|implementer|business-reviewer|test-engineer|scout|decision-partner)$ ]]; then
    shift
fi

if ! command -v claude >/dev/null 2>&1; then
    CLAUDE_BIN="${HOME}/.local/bin/claude"
    if [[ ! -x "${CLAUDE_BIN}" ]]; then
        echo "Claude Code CLI (claude) is not found in PATH or at ${CLAUDE_BIN}." >&2
        exit 127
    fi
else
    CLAUDE_BIN="claude"
fi

exec "${CLAUDE_BIN}" --agent "${ROLE}" "$@"
