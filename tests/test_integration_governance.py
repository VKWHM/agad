"""Every instruction-guided integration must carry the core gates and must not disclaim them."""
import pathlib
import tomllib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
INT = ROOT / "integrations"
ROLES = ("architect", "implementer", "business-reviewer", "test-engineer", "documentation-steward", "scout", "decision-partner")

def claude_agent(role):
    text = (INT / "claude-code/agents" / f"{role}.md").read_text()
    front, body = text[4:].split("\n---\n", 1)
    fm = dict(l.split(": ", 1) for l in front.splitlines() if ": " in l)
    return fm, body

def codex_agent(role):
    data = tomllib.loads((INT / "codex/agents" / f"{role}.toml").read_text())
    return data, data["developer_instructions"]

def bodies(role):
    return {"claude": claude_agent(role)[1], "codex": codex_agent(role)[1]}

ARCHITECT_PHRASES = (
    "silence", "permission", "waive", "exact candidate", "provisional approval", "scenario planning",
    "new revision", "invalidate", "repair", "test-artifact", "stalls", "no numeric retry",
    "teach back", "unknown", "precedent", "disposition", "immutable", "invariant checks cannot be waived",
)
FORBIDDEN = ("no synthetic state", "relaxed", "unrestricted", "trust the instructions", "full native tool")

class IntegrationGovernanceTests(unittest.TestCase):
    def test_architect_carries_every_gate(self):
        for harness, body in bodies("architect").items():
            low = body.lower()
            for phrase in ARCHITECT_PHRASES:
                with self.subTest(harness=harness, phrase=phrase):
                    self.assertIn(phrase, low)

    def test_workers_carry_role_boundaries(self):
        required = {
            "implementer": ("exact", "unknown", "never claim a check", "contract", "candidate reference"),
            "business-reviewer": ("before", "violation", "new scenario", "ambiguity", "risk", "not a code reviewer", "never edit"),
            "test-engineer": ("provisional approval", "waived", "never edit production", "invariant", "fabricate", "fresh report"),
            "documentation-steward": ("provisional approval", "documentation", "rustdoc", "approved", "report"),
            "scout": ("read-only", "never advances", "untrusted"),
            "decision-partner": ("advisory", "cannot", "not a decision"),
        }
        for role, phrases in required.items():
            for harness, body in bodies(role).items():
                for phrase in phrases:
                    with self.subTest(role=role, harness=harness, phrase=phrase):
                        self.assertIn(phrase, body.lower())

    def test_no_integration_disclaims_gates(self):
        files = [p for p in INT.rglob("*") if p.is_file() and p.suffix in {".md", ".toml"}
                 and p.parts[len(INT.parts)] in {"claude-code", "codex"} and "tests" not in p.parts]
        for p in files:
            low = p.read_text().lower()
            for phrase in FORBIDDEN:
                with self.subTest(path=str(p.relative_to(ROOT)), phrase=phrase):
                    self.assertNotIn(phrase, low)

    def test_claude_native_tool_limits(self):
        for role in ROLES:
            fm, _ = claude_agent(role)
            tools = {t.strip().split("(")[0] for t in fm["tools"].split(",")}
            denied = {t.strip() for t in fm.get("disallowedTools", "").split(",")}
            with self.subTest(role=role):
                if role in {"architect", "scout", "decision-partner", "business-reviewer"}:
                    self.assertTrue({"Edit", "Write"}.isdisjoint(tools))
                    self.assertTrue({"Edit", "Write"} <= denied)
                if role in {"architect", "scout", "decision-partner"}:
                    self.assertNotIn("Bash", tools)
                if role != "architect":
                    self.assertNotIn("Agent", tools)
                    self.assertIn("Agent", denied)
        self.assertIn("Agent(", claude_agent("architect")[0]["tools"])
        self.assertIn("AskUserQuestion", claude_agent("architect")[0]["tools"])

    def test_codex_sandbox_modes(self):
        expected = {"architect": "read-only", "business-reviewer": "read-only", "scout": "read-only",
                    "decision-partner": "read-only", "implementer": "workspace-write", "test-engineer": "workspace-write",
                    "documentation-steward": "workspace-write"}
        for role, mode in expected.items():
            with self.subTest(role=role):
                self.assertEqual(codex_agent(role)[0]["sandbox_mode"], mode)
                self.assertEqual((INT / "codex/agents" / f"{role}.toml").read_bytes(),
                                 (INT / "codex/.codex/agents" / f"{role}.toml").read_bytes())

    def test_project_doctrine_files_match_in_gates(self):
        for path in (INT / "claude-code/templates/CLAUDE.md", INT / "codex/AGENTS.md"):
            low = path.read_text().lower()
            for phrase in ("not** approval", "waiver", "provisional approval", "stale", "no numeric retry", "obligations"):
                with self.subTest(path=path.name, phrase=phrase):
                    self.assertIn(phrase, low)

    def test_antigravity_and_omp_carry_precedent_continuity(self):
        for path in (INT / "antigravity/agents/agad-architect.md", INT / "oh-my-pi/agents/architect.md"):
            self.assertIn("precedent", path.read_text().lower())

if __name__ == "__main__":
    unittest.main()
