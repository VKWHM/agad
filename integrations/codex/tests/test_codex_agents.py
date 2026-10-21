import glob
import os
import tomllib
import unittest

class CodexAgentsConfigTests(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        self.agents_dir = os.path.join(self.base_dir, "agents")
        self.dot_codex_agents_dir = os.path.join(self.base_dir, ".codex", "agents")

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

if __name__ == "__main__":
    unittest.main()
