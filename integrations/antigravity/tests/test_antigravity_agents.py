"""Static checks for the instruction-guided Antigravity CLI adapter."""
import pathlib
import subprocess
import tempfile
import unittest

BASE = pathlib.Path(__file__).resolve().parents[1]
AGENTS = BASE / "agents"
EXPECTED = {
    "agad-architect": ("inherit", True, False),
    "agad-implementer": ("flash", False, True),
    "agad-business-reviewer": ("flash", False, True),
    "agad-test-engineer": ("flash", False, True),
    "agad-scout": ("flash", False, True),
    "agad-decision-partner": ("inherit", False, True),
}

def frontmatter(path):
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n"), path
    top, body = text[4:].split("\n---\n", 1)
    lines = top.splitlines()
    values = {}
    tools = []
    in_tools = False
    for line in lines:
        if line == "tools:":
            in_tools = True
        elif in_tools and line.startswith("  - "):
            tools.append(line[4:])
        elif ":" in line:
            in_tools = False
            key, value = line.split(":", 1)
            values[key] = value.strip()
    return values, tools, body

class AntigravityAgentsTests(unittest.TestCase):
    def test_six_native_markdown_agents(self):
        self.assertEqual({p.stem for p in AGENTS.glob("*.md")}, set(EXPECTED))
        for name, (model, main, sub) in EXPECTED.items():
            with self.subTest(name=name):
                fields, tools, body = frontmatter(AGENTS / (name + ".md"))
                self.assertEqual(fields["name"], name)
                self.assertEqual(fields["model"], model)
                self.assertEqual(fields["mainAgent"], str(main).lower())
                self.assertEqual(fields["subagent"], str(sub).lower())
                self.assertEqual(fields["commandExecutionPolicy"], "sandbox")
                self.assertTrue(tools)
                self.assertTrue(body.strip())

    def test_read_only_roles_have_no_write_or_shell_tools(self):
        dangerous = {"write_to_file", "replace_file_content", "multi_replace_file_content", "run_command"}
        for name in ("agad-scout", "agad-business-reviewer", "agad-decision-partner"):
            _, tools, _ = frontmatter(AGENTS / (name + ".md"))
            self.assertTrue(dangerous.isdisjoint(tools), name)
        _, tools, _ = frontmatter(AGENTS / "agad-architect.md")
        self.assertTrue(dangerous.isdisjoint(tools))

    def test_workflow_gates_and_markdown_reports(self):
        architect = (AGENTS / "agad-architect.md").read_text()
        tester = (AGENTS / "agad-test-engineer.md").read_text()
        worker = (AGENTS / "agad-implementer.md").read_text()
        self.assertIn("provisional approval", architect.lower())
        self.assertIn("business review", tester.lower())
        self.assertIn("without writing or executing tests", tester)
        self.assertIn("Markdown", worker)
        self.assertIn("root causes", worker)
        self.assertNotIn("submit_implementation", worker)

    def test_install_is_idempotent_and_preserves_existing_guidance(self):
        with tempfile.TemporaryDirectory() as d:
            target = pathlib.Path(d)
            script = BASE / "scripts/install.sh"
            subprocess.run(["bash", str(script), d], check=True, capture_output=True, text=True)
            subprocess.run(["bash", str(script), d], check=True, capture_output=True, text=True)
            self.assertEqual(len(list((target / ".agents/agents").glob("agad-*.md"))), 6)
            self.assertEqual((target / "AGENTS.md").read_bytes(), (BASE / "AGENTS.md").read_bytes())
            (target / "AGENTS.md").write_text("existing project rules\n")
            subprocess.run(["bash", str(script), d], check=True, capture_output=True, text=True)
            self.assertEqual((target / "AGENTS.md").read_text(), "existing project rules\n")
            (target / ".agents/agents/agad-scout.md").write_text("conflicting agent\n")
            conflict = subprocess.run(["bash", str(script), d], capture_output=True, text=True)
            self.assertNotEqual(conflict.returncode, 0)
            self.assertIn("Refusing to overwrite", conflict.stderr)

    def test_launch_profiles_are_exact_and_reject_unknown_role(self):
        script = (BASE / "scripts/launch.sh").read_text()
        for model in ("gemini-4-argon-high", "gemini-3.8-flash-high",
                      "gemini-3.8-flash-medium", "gemini-3.8-flash-low"):
            self.assertIn(model, script)
        with tempfile.TemporaryDirectory() as d:
            unknown = subprocess.run(["bash", str(BASE / "scripts/launch.sh"), "unknown"],
                                     cwd=d, capture_output=True, text=True)
            self.assertEqual(unknown.returncode, 2)

if __name__ == "__main__":
    unittest.main()
