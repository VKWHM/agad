# Decisions and open choices

## Adopted from developer direction

- AGAD means Architecture-Governed Agentic Development.
- The Developer is central and retains business authority, code review and final acceptance.
- Architect is the interactive coordinator; no independent Orchestrator role.
- Business Reviewer discovers business scenarios after implementation; it is not an AI code reviewer.
- Test Engineer follows business review and developer provisional approval.
- This repository starts with abstraction only; harness implementations are deferred.

## Initial proposals requiring developer review

These are specification defaults, not claims that the developer already approved them:

- Specification version 0.1.0; immutable integer contract revisions within each change.
- Production candidate and final delivery are distinct references so added tests cannot invalidate identity ambiguously.
- Two unsuccessful repair cycles trigger a developer retry-budget decision; tune by risk.
- Existing behavior requires explicit approval to preserve within scope; low-risk preservation can be approved as a bounded group.
- No open-source license until the repository owner selects one.
- A Python standard-library checker illustrates governance; the abstract model mandates no language.

Repository provisioning defaults: name `agad`, private visibility, owned by the authenticated personal account. These are reversible setup choices, not AGAD domain policy.

## Deferred

Harness adapter design, authentication storage, execution isolation, actual delegation, provider model mappings, and approval UI. The user's preferred Sol/Luna profiles remain allocation preferences; exact model IDs and supported fallbacks belong to future integrations. Do not add adapter-specific policy to the core.
