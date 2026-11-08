import glob
import json
import os
import shutil
import subprocess
import unittest

class ClaudeAgentsConfigTests(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        self.agents_dir = os.path.join(self.base_dir, "agents")
        self.commands_dir = os.path.join(self.base_dir, "commands")
        self.skills_dir = os.path.join(self.base_dir, "skills")
        self.plugin_json = os.path.join(self.base_dir, "plugin.json")
        self.dot_claude_plugin_json = os.path.join(self.base_dir, ".claude-plugin", "plugin.json")
        self.marketplace_json = os.path.join(self.base_dir, ".claude-plugin", "marketplace.json")

    def _parse_frontmatter(self, file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertTrue(content.startswith("---"), f"{file_path} missing frontmatter")
        parts = content.split("---", 2)
        self.assertGreaterEqual(len(parts), 3, f"{file_path} malformed frontmatter")
        frontmatter_text = parts[1]
        body = parts[2]
        data = {}
        for line in frontmatter_text.strip().splitlines():
            line = line.strip()
            if ":" in line:
                key, val = line.split(":", 1)
                data[key.strip()] = val.strip()
        return data, body

    def test_plugin_manifest_valid(self):
        for path in (self.plugin_json, self.dot_claude_plugin_json):
            self.assertTrue(os.path.isfile(path), f"{path} must exist")
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(data.get("name"), "agad")
            self.assertEqual(data.get("version"), "0.1.0")
            self.assertIn("description", data)
            self.assertIn("author", data)
            self.assertIn("skills", data)
            self.assertIn("commands", data)

    def test_marketplace_manifest_valid(self):
        self.assertTrue(os.path.isfile(self.marketplace_json), "marketplace.json must exist")
        with open(self.marketplace_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data.get("name"), "agad")
        self.assertIn("plugins", data)
        plugin_names = [p.get("name") for p in data["plugins"]]
        self.assertIn("agad", plugin_names)
        agad_plugin = next(p for p in data["plugins"] if p.get("name") == "agad")
        self.assertEqual(agad_plugin.get("source"), "./")

    def test_agents_valid_frontmatter_and_roles(self):
        expected_configs = {
            "architect": ("claude-opus-5-5", "medium"),
            "implementer": ("claude-sonnet-5-5", "medium"),
            "business-reviewer": ("claude-sonnet-5-5", "high"),
            "test-engineer": ("claude-haiku-5-5", "high"),
            "scout": ("claude-haiku-5-5", "low"),
            "decision-partner": ("claude-opus-5-5", "high"),
        }
        found_roles = set()
        files = glob.glob(os.path.join(self.agents_dir, "*.md"))
        self.assertEqual(len(files), 6, "Expected exactly 6 agent markdown files")

        for f in files:
            fm, body = self._parse_frontmatter(f)
            name = fm.get("name")
            self.assertIn("name", fm, f"{f} missing name")
            self.assertIn("description", fm, f"{f} missing description")
            self.assertIn("model", fm, f"{f} missing model")
            self.assertIn("effort", fm, f"{f} missing effort")
            self.assertIn("tools", fm, f"{f} missing tools")
            self.assertTrue(body.strip(), f"{f} body is empty")
            found_roles.add(name)

            self.assertIn(name, expected_configs, f"Unexpected agent: {name}")
            exp_model, exp_effort = expected_configs[name]
            self.assertEqual(fm["model"], exp_model, f"{f} wrong model")
            self.assertEqual(fm["effort"], exp_effort, f"{f} wrong effort")

        self.assertEqual(found_roles, set(expected_configs.keys()))

    def test_commands_valid(self):
        expected_commands = {"agad", "agad-contract", "agad-review", "agad-test"}
        found_commands = set()
        for c in expected_commands:
            path = os.path.join(self.commands_dir, f"{c}.md")
            self.assertTrue(os.path.isfile(path), f"Command {path} must exist")
            fm, body = self._parse_frontmatter(path)
            self.assertIn("description", fm, f"{path} missing description")
            self.assertTrue(body.strip(), f"{path} body is empty")
            found_commands.add(c)
        self.assertEqual(found_commands, expected_commands)

    def test_skills_valid(self):
        expected_skills = {"agad", "agad-contract", "agad-review", "agad-test"}
        for s in expected_skills:
            skill_md = os.path.join(self.skills_dir, s, "SKILL.md")
            self.assertTrue(os.path.isfile(skill_md), f"{skill_md} must exist")
            fm, body = self._parse_frontmatter(skill_md)
            self.assertEqual(fm.get("name"), s)
            self.assertIn("description", fm)
            self.assertTrue(body.strip())

    def test_install_and_launch_scripts_executable(self):
        for script_name in ("install.sh", "launch.sh"):
            script_path = os.path.join(self.base_dir, "scripts", script_name)
            self.assertTrue(os.path.isfile(script_path), f"{script_name} must exist")
            self.assertTrue(os.access(script_path, os.X_OK), f"{script_name} must be executable")

    def test_claude_cli_validation(self):
        claude_bin = shutil.which("claude") or "/Users/vkwhm/.local/bin/claude"
        if not os.path.exists(claude_bin):
            self.skipTest("claude CLI not available")
        result = subprocess.run(
            [claude_bin, "plugin", "validate", "--strict", self.base_dir],
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0, f"Claude validation failed: {result.stderr}\n{result.stdout}")

if __name__ == "__main__":
    unittest.main()
