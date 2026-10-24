#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/project" >&2
  exit 2
fi
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="$(cd "$1" && pwd)"
agents_dir="$target/.agents/agents"

# Preflight before copying anything: never silently replace a project's agents.
for file in "$source_dir"/agents/*.md; do
  installed="$agents_dir/$(basename "$file")"
  if [[ -e "$installed" ]] && ! cmp -s "$file" "$installed"; then
    echo "Refusing to overwrite $installed; reconcile it manually." >&2
    exit 1
  fi
done
mkdir -p "$agents_dir"
for file in "$source_dir"/agents/*.md; do
  installed="$agents_dir/$(basename "$file")"
  if [[ ! -e "$installed" ]]; then cp "$file" "$installed"; fi
done

# The workspace instruction file must not replace existing project guidance.
if [[ ! -e "$target/AGENTS.md" ]]; then
  cp "$source_dir/AGENTS.md" "$target/AGENTS.md"
else
  echo "Existing AGENTS.md preserved; merge AGAD guidance from $source_dir/AGENTS.md if needed." >&2
fi
echo "AGAD agents installed in $agents_dir"
