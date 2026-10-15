# Governance rules and enforcement limits

| ID | Rule | Automated reference check |
| --- | --- | --- |
| G01 | Only Developer approves contract, testing, final acceptance | Actor and explicit decision reference |
| G02 | Implementation requires current approved contract | State order and revision binding |
| G03 | Independent testing follows business review and provisional approval | State order and candidate binding |
| G04 | In-scope unknown semantics block authorization | Knowledge-state validation |
| G05 | Existing behavior needs explicit preservation approval | Requirement record |
| G06 | Delegated choices need owner, bounds and escalation trigger | Requirement record |
| G07 | Findings require developer disposition before testing | Review IDs equal approval disposition IDs |
| G08 | Revisions/fixes invalidate downstream approval | Return to dialogue; monotonic revisions; fresh candidate ID |
| G09 | Final acceptance requires passing outcome-linked evidence and human code review | Coverage, report/delivery reference and decision record |
| G10 | Business Reviewer and Test Engineer cannot alter production semantics | Role policy; filesystem enforcement belongs to future runtimes |
| G11 | Approvals are attributable, durable and authentic | Reference checker requires source; authentication belongs to future runtimes |
| G12 | Retry budget exhaustion returns control to Developer | Operational policy; no autonomous retry engine is implemented |

`tools/validate.py` replays a single change record and rejects illegal transitions. The accepted JSON is a simulated example, not evidence of real developer approval. The checker deliberately does not execute agents or repository commands.

A compliant future execution environment must enforce role write scopes, human identity, immutable artifact resolution, append-only decision history, stale approval rejection and retry limits. Automated governance checks validate explicit evidence; they do not judge whether an edge case is valuable or a business rule is true. Use human review for those decisions.

Validation must fail closed on malformed records, unknown event types and missing references. Never use a checker result as final acceptance or treat a role label in untrusted agent output as authenticated authority.
