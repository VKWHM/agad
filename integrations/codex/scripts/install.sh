#!/usr/bin/env bash
set -euo pipefail

# AGAD Codex Setup Script
# Installs or links AGAD agents and configuration for Codex CLI

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEX_INTEGRATION_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET="${1:-project}"

if [ "${TARGET}" = "global" ]; then
    DEST_DIR="${HOME}/.codex/agents"
    echo "Installing AGAD agents globally to ${DEST_DIR}..."
    mkdir -p "${DEST_DIR}"
    cp -v "${CODEX_INTEGRATION_DIR}/agents/"*.toml "${DEST_DIR}/"
    echo "Done! AGAD agents are now available across all projects in Codex."
elif [ "${TARGET}" = "profile" ]; then
    echo "Installing AGAD profile to ${HOME}/.codex/agad.config.toml..."
    mkdir -p "${HOME}/.codex"
    cat << EOF > "${HOME}/.codex/agad.config.toml"
model = "gpt-6.1-sol"
model_reasoning_effort = "high"
model_instructions_file = "${CODEX_INTEGRATION_DIR}/AGENTS.md"
EOF
    echo "Installed ~/.codex/agad.config.toml"
    echo "You can now run: codex -p agad"
    echo "Tip: Add this alias to your ~/.zshrc or ~/.bashrc:"
    echo "  alias codex-agad='codex -p agad'"
elif [ "${TARGET}" = "project" ]; then
    PROJECT_ROOT="${2:-$(pwd)}"
    DEST_DIR="${PROJECT_ROOT}/.codex/agents"
    echo "Installing AGAD configuration to project: ${PROJECT_ROOT}..."
    mkdir -p "${DEST_DIR}"
    cp -v "${CODEX_INTEGRATION_DIR}/agents/"*.toml "${DEST_DIR}/"
    if [ ! -f "${PROJECT_ROOT}/AGENTS.md" ]; then
        cp -v "${CODEX_INTEGRATION_DIR}/AGENTS.md" "${PROJECT_ROOT}/AGENTS.md"
        echo "Created ${PROJECT_ROOT}/AGENTS.md"
    else
        echo "Note: ${PROJECT_ROOT}/AGENTS.md already exists; keeping existing file."
    fi
    echo "Done! AGAD is configured for project at ${PROJECT_ROOT}."
else
    echo "Usage: $0 [project <path> | global | profile]"
    exit 1
fi
