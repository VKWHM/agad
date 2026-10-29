import glob
import json
import os
import tomllib
import unittest

class CodexAgentsConfigTests(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        self.agents_dir = os.path.join(self.base_dir, "agents")
        self.dot_codex_agents_dir = os.path.join(self.base_dir, ".codex", "agents")
        self.skills_dir = os.path.join(self.base_dir, "skills")
        self.plugin_json = os.path.join(self.base_dir, "plugin.json")
        self.dot_codex_plugin_json = os.path.join(self.base_dir, ".codex-plugin", "plugin.json")
        self.marketplace_json = os.path.join(self.base_dir, ".agents", "plugins", "marketplace.json")

    def test_agents_valid_toml_and_schema(self):
        files = glob.glob(os.path.join(self.agents_dir, "*.toml"))
        self.assertGreaterEqual(len(files), 5, "Should have defined at least 5 AGAD agents")
        expected_roles = {"architect", "implementer", "business-reviewer", "test-engineer", "scout", "decision-partner"}
        found_roles = set()

        expected_models = {
            "architect": ("gpt-6.1-sol", "high"),
            "implementer": ("gpt-6.1-sol", "medium"),
            "business-reviewer": ("gpt-6.1-sol", "medium"),
            "test-engineer": ("gpt-6-luna", "high"),
            "scout": ("gpt-6-luna", "low"),
            "decision-partner": ("gpt-6.1-sol", "high"),
        }

        for f in files:
            with open(f, "rb") as fp:
                data = tomllib.load(fp)
            name = data.get("name")
            self.assertIn("name", data, f"{f} missing 'name'")
            self.assertIn("developer_instructions", data, f"{f} missing 'developer_instructions'")
            self.assertTrue(data["developer_instructions"].strip(), f"{f} has empty developer instructions")
            self.assertIn("model", data, f"{f} missing 'model'")
            self.assertIn("model_reasoning_effort", data, f"{f} missing 'model_reasoning_effort'")
            found_roles.add(name)

            if name in expected_models:
                exp_model, exp_effort = expected_models[name]
                self.assertEqual(data["model"], exp_model, f"{f} expected model {exp_model}")
                self.assertEqual(data["model_reasoning_effort"], exp_effort, f"{f} expected effort {exp_effort}")

        self.assertTrue(expected_roles.issubset(found_roles), f"Missing roles: {expected_roles - found_roles}")

    def test_dot_codex_agents_synced(self):
        main_files = {os.path.basename(p) for p in glob.glob(os.path.join(self.agents_dir, "*.toml"))}
        dot_files = {os.path.basename(p) for p in glob.glob(os.path.join(self.dot_codex_agents_dir, "*.toml"))}
        self.assertEqual(main_files, dot_files, ".codex/agents must match agents/ files")

    def test_install_script_executable(self):
        install_script = os.path.join(self.base_dir, "scripts", "install.sh")
        self.assertTrue(os.path.isfile(install_script), "install.sh must exist")
        self.assertTrue(os.access(install_script, os.X_OK), "install.sh must be executable")

    def test_plugin_manifest_valid(self):
        for path in (self.plugin_json, self.dot_codex_plugin_json):
            self.assertTrue(os.path.isfile(path), f"{path} must exist")
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(data.get("name"), "agad")
            self.assertIn("version", data)
            self.assertIn("description", data)
            self.assertEqual(data.get("skills"), "./skills/")
            self.assertIn("interface", data)
            self.assertIn("displayName", data["interface"])

    def test_marketplace_manifest_valid(self):
        self.assertTrue(os.path.isfile(self.marketplace_json), "marketplace.json must exist")
        with open(self.marketplace_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data.get("name"), "agad")
        self.assertIn("plugins", data)
        plugin_names = [p.get("name") for p in data["plugins"]]
        self.assertIn("agad", plugin_names)
        agad_plugin = next(p for p in data["plugins"] if p.get("name") == "agad")
        self.assertEqual(agad_plugin.get("source", {}).get("source"), "local")
        self.assertEqual(agad_plugin.get("source", {}).get("path"), "./")

    def test_skills_structure(self):
        expected_skills = {"agad", "agad-contract", "agad-review", "agad-test"}
        found_skills = set(os.listdir(self.skills_dir))
        self.assertTrue(expected_skills.issubset(found_skills), f"Missing skills: {expected_skills - found_skills}")

        for skill_name in expected_skills:
            skill_dir = os.path.join(self.skills_dir, skill_name)
            skill_md = os.path.join(skill_dir, "SKILL.md")
            openai_yaml = os.path.join(skill_dir, "agents", "openai.yaml")
            self.assertTrue(os.path.isfile(skill_md), f"{skill_md} must exist")
            self.assertTrue(os.path.isfile(openai_yaml), f"{openai_yaml} must exist")

            with open(skill_md, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertTrue(content.startswith("---"), f"{skill_md} must have YAML frontmatter")
            self.assertIn(f"name: {skill_name}", content)
            self.assertIn("description:", content)

            with open(openai_yaml, "r", encoding="utf-8") as f:
                yaml_content = f.read()
            self.assertIn("interface:", yaml_content)
            self.assertIn("display_name:", yaml_content)
            self.assertIn("default_prompt:", yaml_content)

if __name__ == "__main__":
    unittest.main()
