#!/usr/bin/env bash
set -euo pipefail

# AGAD Claude Code Setup Script
# Installs AGAD as a native Claude Code plugin, project agents/commands, or global configuration

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_INTEGRATION_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET="${1:-plugin}"

if [ "${TARGET}" = "plugin" ]; then
    echo "Registering AGAD local marketplace with Claude Code..."
    claude plugin marketplace add "${CLAUDE_INTEGRATION_DIR}"
    echo "Installing AGAD plugin into Claude Code..."
    claude plugin install agad@agad
    echo "Done! AGAD plugin is installed and enabled in Claude Code."
    echo "You can now use AGAD slash commands (/agad, /agad-contract, /agad-review, /agad-test), skills, and subagents."
elif [ "${TARGET}" = "global" ]; then
    DEST_AGENTS="${HOME}/.claude/agents"
    DEST_COMMANDS="${HOME}/.claude/commands"
    echo "Installing AGAD agents globally to ${DEST_AGENTS}..."
    mkdir -p "${DEST_AGENTS}" "${DEST_COMMANDS}"
    cp -v "${CLAUDE_INTEGRATION_DIR}/agents/"*.md "${DEST_AGENTS}/"
    echo "Installing AGAD commands globally to ${DEST_COMMANDS}..."
    cp -v "${CLAUDE_INTEGRATION_DIR}/commands/"*.md "${DEST_COMMANDS}/"
    echo "Done! AGAD agents and commands are now available across all projects in Claude Code."
elif [ "${TARGET}" = "project" ]; then
    PROJECT_ROOT="${2:-$(pwd)}"
    DEST_AGENTS="${PROJECT_ROOT}/.claude/agents"
    DEST_COMMANDS="${PROJECT_ROOT}/.claude/commands"
    echo "Installing AGAD configuration to project: ${PROJECT_ROOT}..."
    mkdir -p "${DEST_AGENTS}" "${DEST_COMMANDS}"
    cp -v "${CLAUDE_INTEGRATION_DIR}/agents/"*.md "${DEST_AGENTS}/"
    cp -v "${CLAUDE_INTEGRATION_DIR}/commands/"*.md "${DEST_COMMANDS}/"
    if [ ! -f "${PROJECT_ROOT}/CLAUDE.md" ]; then
        cp -v "${CLAUDE_INTEGRATION_DIR}/templates/CLAUDE.md" "${PROJECT_ROOT}/CLAUDE.md"
        echo "Created ${PROJECT_ROOT}/CLAUDE.md"
    else
        echo "Note: ${PROJECT_ROOT}/CLAUDE.md already exists; keeping existing file."
    fi
    echo "Done! AGAD is configured for project at ${PROJECT_ROOT}."
else
    echo "Usage: $0 [plugin | project <path> | global]"
    exit 1
fi
