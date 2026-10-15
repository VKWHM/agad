"""Exercise the real OMP question and tmux consultation pane without model calls."""
import fcntl
import json
import os
import pty
import re
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
omp = shutil.which("omp")
tmux = shutil.which("tmux")
if not omp:
    raise SystemExit("terminal UI smoke blocked: installed omp executable not found")
if not tmux:
    raise SystemExit("terminal UI smoke blocked: tmux is required to exercise the actual split pane")
source = root / "src"
server_name = f"agad-ui-{os.getpid()}"
session_name = server_name
server_started = False
pid = None
fd = None

with tempfile.TemporaryDirectory(prefix="agad-ui-smoke-") as temporary:
    temp = Path(temporary)
    result_path = temp / "answer.json"
    partner_started_path = temp / "partner-started"
    partner_cancelled_path = temp / "partner-cancelled"
    fixture = temp / "fixture.ts"
    fixture.write_text(f'''import {{ askPending }} from {json.dumps(str(source / "dialog.ts"))};
import {{ writeFile }} from "node:fs/promises";
export default function (pi: any) {{
  pi.registerCommand("agad-ui-smoke", {{
    description: "Temporary interactive AGAD dialog smoke fixture",
    handler: async (_args: string, ctx: any) => {{
      const pending = {{
        id: "ui-smoke-question", question: "Choose the approved smoke outcome",
        options: [{{ label: "Approve" }}, {{ label: "Request changes" }}],
        context: JSON.stringify({{ event: {{ type: "provisionally_approve", reason: "smoke exact reason" }},
          contract: {{ requirements: [{{ id: "R7", provenance: "smoke fixture" }}] }},
          scope: {{ production: ["src/production.ts"], tests: ["tests/smoke-ui.py"] }},
          checks: {{ exact: ["bun", "test", "--approved"] }}, checkpoint: {{ evidence: "fixture evidence" }} }}),
        consultation: [], revision: 2, candidate: "fixture-candidate",
        event: {{ type: "provisionally_approve" }},
      }};
      const questionSnapshot = JSON.stringify({{
        id: pending.id, question: pending.question, options: pending.options, context: pending.context,
        revision: pending.revision, candidate: pending.candidate,
      }});
      const prompts: string[] = [];
      let saves = 0;
      const answer = await askPending(pending, {{
        ui: ctx.ui, save() {{ saves++; }}, current() {{}},
        partner: async (prompt: string, signal?: AbortSignal) => {{
          prompts.push(prompt);
          if (prompt === \"Close while waiting\") {{
            await writeFile({json.dumps(str(partner_started_path))}, \"started\");
            return new Promise<string>((resolve, reject) => {{
              const cancel = () => {{
                void writeFile({json.dumps(str(partner_cancelled_path))}, \"aborted\")
                  .then(() => reject(new Error(\"Partner request cancelled\")));
              }};
              if (signal?.aborted) cancel();
              else signal?.addEventListener(\"abort\", cancel, {{ once: true }});
            }});
          }}
          return `Fixture advisory response: ${{prompt}}`;
        }},
      }});
      const questionUnchanged = questionSnapshot === JSON.stringify({{
        id: pending.id, question: pending.question, options: pending.options, context: pending.context,
        revision: pending.revision, candidate: pending.candidate,
      }});
      await writeFile({json.dumps(str(result_path))}, JSON.stringify({{ answer, consultation: pending.consultation,
        prompts, saves, questionUnchanged, question: {{ id: pending.id, revision: pending.revision, candidate: pending.candidate }} }}));
    }}
  }});
}}
''', encoding="utf-8")

    screens = {}
    try:
        launch = subprocess.run(
            [tmux, "-L", server_name, "-f", "/dev/null", "new-session", "-d", "-s", session_name,
             "-x", "110", "-y", "32", "--", omp, "--no-extensions",
             "--no-prewalk", "--no-title", "--no-session", "--extension", str(root),
             "--extension", str(fixture)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False,
        )
        if launch.returncode:
            raise RuntimeError(f"could not start isolated tmux fixture: {launch.stderr.strip()}")
        server_started = True
        left_pane = subprocess.run(
            [tmux, "-L", server_name, "display-message", "-p", "-t", f"{session_name}:0", "#{pane_id}"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True,
        ).stdout.strip()

        pid, fd = pty.fork()
        if pid == 0:
            os.execvp(tmux, [tmux, "-L", server_name, "attach-session", "-t", session_name])

        def resize(rows, cols):
            fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
            os.kill(pid, signal.SIGWINCH)

        def capture(duration):
            end, data = time.monotonic() + duration, bytearray()
            while time.monotonic() < end:
                ready, _, _ = select.select([fd], [], [], min(0.15, end - time.monotonic()))
                if ready:
                    try:
                        chunk = os.read(fd, 65536)
                    except OSError:
                        break
                    if not chunk:
                        break
                    data.extend(chunk)
            return data.decode("utf-8", "replace")

        def visible(value):
            value = re.sub(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))", "", value)
            return re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", value)

        def choose_chat(label):
            os.write(fd, b"\x1b[B\x1b[B\x1b[B\r")
            screen = visible(capture(3))
            if "Decision Partner" not in screen:
                raise RuntimeError(f"{label}: selecting the consultation action did not open a partner pane")
            return screen

        for name, rows, cols in (("normal", 32, 110), ("narrow", 18, 52)):
            resize(rows, cols)
            screens[name] = visible(capture(2))
            if "AGAD" not in screens[name] or "Next:" not in screens[name]:
                raise RuntimeError(f"{name}-width panel not observed after resize: {screens[name][-6000:]!r}")

        resize(32, 110)
        os.write(fd, b"/agad-ui-smoke\r")
        screens["question"] = visible(capture(3))
        if "Approve" not in screens["question"] or "Chat about this" not in screens["question"]:
            raise RuntimeError("real rich question did not display the ordinary answer and Decision Partner action")

        screens["pane-first"] = choose_chat("first consultation")
        if "smoke exact reason" not in screens["pane-first"] or "Choose the approved smoke outcome" not in screens["pane-first"]:
            raise RuntimeError("right pane omitted the unchanged question or its full context")
        def norm(value):
            return re.sub(r"\s+", " ", value)

        os.write(fd, b"Fixture research question\r")
        screens["first-response"] = visible(capture(4))
        if "Fixture advisory response: Fixture research question" not in norm(screens["first-response"]):
            raise RuntimeError("tmux composer did not send the first question through the fixture Partner callback")
        os.write(fd, b"Compare alternatives\r")
        screens["follow-up"] = visible(capture(4))
        if "Fixture advisory response: Compare alternatives" not in norm(screens["follow-up"]):
            raise RuntimeError("tmux consultation did not support a follow-up exchange")

        pane_rows = subprocess.run(
            [tmux, "-L", server_name, "list-panes", "-t", f"{session_name}:0", "-F", "#{pane_id} #{pane_width}"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True,
        ).stdout.splitlines()
        pane_widths = {pane: int(width) for pane, width in (row.split() for row in pane_rows)}
        active_panes = list(pane_widths)
        right_panes = [pane for pane in active_panes if pane != left_pane]
        if len(right_panes) != 1:
            raise RuntimeError(f"expected one real right-hand tmux pane, found {active_panes}")
        if pane_widths[left_pane] <= pane_widths[right_panes[0]]:
            raise RuntimeError(f"the main OMP pane was not wider than the consultation pane: {pane_widths}")
        pane_command = subprocess.run(
            [tmux, "-L", server_name, "display-message", "-p", "-t", right_panes[0], "#{pane_start_command}"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True,
        ).stdout
        if "Fixture research question" in pane_command or "Compare alternatives" in pane_command:
            raise RuntimeError("human consultation text leaked into the tmux pane command/argv")

        os.write(fd, b"/return\r")
        screens["returned"] = visible(capture(4))
        if "Approve" not in screens["returned"]:
            raise RuntimeError("/return did not restore the same pending question")

        screens["pane-reopened"] = choose_chat("reopened consultation")
        if "Fixture research question" not in norm(screens["pane-reopened"]) or "Fixture advisory response: Compare alternatives" not in norm(screens["pane-reopened"]):
            raise RuntimeError("reopening the tmux pane did not restore the saved consultation transcript")
        os.write(fd, b"Close while waiting\r")
        deadline = time.monotonic() + 5
        while not partner_started_path.exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        if not partner_started_path.exists():
            raise RuntimeError("the fixture Partner request did not start before closing the pane")
        active_panes = subprocess.run(
            [tmux, "-L", server_name, "list-panes", "-t", f"{session_name}:0", "-F", "#{pane_id}"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True,
        ).stdout.splitlines()
        right_panes = [pane for pane in active_panes if pane != left_pane]
        if len(right_panes) != 1:
            raise RuntimeError(f"expected one right-hand pane before close, found {active_panes}")
        subprocess.run([tmux, "-L", server_name, "kill-pane", "-t", right_panes[0]], check=True)
        screens["closed-during-partner"] = visible(capture(4))
        if "Approve" not in screens["closed-during-partner"]:
            raise RuntimeError("closing the pane during a Partner request did not return to the same pending question")
        deadline = time.monotonic() + 3
        while not partner_cancelled_path.exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        if not partner_cancelled_path.exists():
            raise RuntimeError("closing the pane did not abort the active Partner callback")

        os.write(fd, b"\x1b[B\x1b[B\r")
        screens["details"] = visible(capture(3))
        markers = ("smoke exact reason", "src/production.ts", "tests/smoke-ui.py", "fixture evidence")
        # Native editor initially shows the end of a long report. Inspect earlier pages too.
        for _ in range(20):
            if all(marker in screens["details"] for marker in markers):
                break
            os.write(fd, b"\x1b[5~")
            screens["details"] += visible(capture(0.25))
        for marker in markers:
            if marker not in screens["details"]:
                raise RuntimeError(f"full details view omitted expected payload field: {marker}; screen={screens['details'][-6000:]!r}")
        os.write(fd, b"\x1b")
        screens["details-return"] = visible(capture(2))
        if "Approve" not in screens["details-return"]:
            raise RuntimeError("Escape from details did not return to the unchanged question")
        os.write(fd, b"\r")
        screens["answer"] = visible(capture(3))
        if not result_path.exists():
            raise RuntimeError("explicit ordinary answer did not complete the temporary fixture command")
        outcome = json.loads(result_path.read_text(encoding="utf-8"))
        expected_turns = [
            {"speaker": "developer", "text": "Fixture research question"},
            {"speaker": "partner", "text": "Fixture advisory response: Fixture research question"},
            {"speaker": "developer", "text": "Compare alternatives"},
            {"speaker": "partner", "text": "Fixture advisory response: Compare alternatives"},
            {"speaker": "developer", "text": "Close while waiting"},
        ]
        if outcome.get("answer", {}).get("selected") != "Approve" or outcome.get("consultation") != expected_turns:
            raise RuntimeError(f"unexpected final answer or persisted consultation transcript: {outcome}")
        if outcome.get("prompts") != ["Fixture research question", "Compare alternatives", "Close while waiting"] or outcome.get("saves") != 5:
            raise RuntimeError(f"unexpected fixture Partner calls or transcript save lifecycle: {outcome}")
        if outcome.get("question") != {"id": "ui-smoke-question", "revision": 2, "candidate": "fixture-candidate"} or not outcome.get("questionUnchanged"):
            raise RuntimeError(f"consultation changed the pending question identity or options/context: {outcome}")
    finally:
        if server_started:
            subprocess.run([tmux, "-L", server_name, "kill-server"], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, check=False)
        if pid is not None:
            try:
                deadline = time.monotonic() + 4
                ended = False
                while time.monotonic() < deadline:
                    child, _ = os.waitpid(pid, os.WNOHANG)
                    if child:
                        ended = True
                        break
                    time.sleep(0.05)
                if not ended:
                    os.kill(pid, signal.SIGTERM)
                    os.waitpid(pid, 0)
            except ChildProcessError:
                pass
        if fd is not None:
            os.close(fd)

    for name, screen in screens.items():
        print(f"{name}: {len(screen)} printable chars; {screen[-350:]}")
    print("PASS: real OMP question, right-hand tmux consultation, follow-ups, transcript reopen, in-flight cancellation, argv privacy, full details and explicit answer exercised with a deterministic Partner fixture; no model call.")
