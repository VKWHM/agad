"""Ensure Implementer economy instructions remain aligned and preserve handoffs."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
OMP = ROOT / "integrations/oh-my-pi/agents/implementer.md"
CODEX = ROOT / "integrations/codex/agents/implementer.toml"
CODEX_COPY = ROOT / "integrations/codex/.codex/agents/implementer.toml"

class ImplementerGuidanceTests(unittest.TestCase):
    def test_codex_copies_match(self):
        self.assertEqual(CODEX.read_bytes(), CODEX_COPY.read_bytes())

    def test_guidance_preserves_economy_and_governance(self):
        for p in (OMP, CODEX):
            with self.subTest(path=str(p)):
                content = p.read_text().lower()
                for phrase in ("approved", "existing", "root cause", "invariant", "risk", "architect", "test"):
                    self.assertIn(phrase, content)

    def test_omp_json_report_unchanged(self):
        content = OMP.read_text()
        self.assertIn("Return only a JSON core submit_implementation report", content)
        for field in ('"outcomes"', '"evidence"', '"delegated_choices"'):
            self.assertIn(field, content)
        self.assertIn("Host binds actor, revision and candidate fingerprint", content)

    def test_no_quality_shortcut_in_core(self):
        content = (ROOT / "docs/roles.md").read_text()
        self.assertIn("Code size is not a quality metric", content)
        self.assertIn("No new gate or report fields", content)

if __name__ == "__main__":
    unittest.main()
