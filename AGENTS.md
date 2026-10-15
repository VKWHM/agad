# Working on AGAD

Maintain a harness-independent core. Do not add provider model IDs, harness APIs, or execution-framework assumptions. Treat draft design defaults as proposals until the developer decides them.

Preserve the explicit workflow and human authority. Business Reviewer is not a code reviewer. Unknown business meaning must remain unknown until resolved or explicitly excluded by the developer.

When changing governance, update the specification, reference checker, worked example and meaningful conformance tests together. Run `python3 -m unittest discover -s tests -v` and `python3 tools/validate.py examples/accepted.json`.

Do not claim this repository enforces agent tool permissions or authenticates approvals. It defines those obligations and validates record consistency only.
