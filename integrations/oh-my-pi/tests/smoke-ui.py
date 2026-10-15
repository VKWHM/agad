"""Exercise installed OMP and real AGAD dialogs using a temporary native-UI fixture."""
import fcntl
import json
import os
import pty
import re
import select
import shutil
import signal
import struct
import tempfile
import termios
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
omp = shutil.which("omp")
if not omp:
    raise SystemExit("terminal UI smoke blocked: installed omp executable not found")
source = root / "src"
with tempfile.TemporaryDirectory(prefix="agad-ui-smoke-") as temporary:
    temp = Path(temporary)
    result_path = temp / "answer.json"
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
      const answer = await askPending(pending, {{ ui: ctx.ui, save() {{}}, partner: async () => {{
        throw new Error("Smoke consultation must be cancelled before a model call");
      }} }});
      await writeFile({json.dumps(str(result_path))}, JSON.stringify({{ answer, consultation: pending.consultation }}));
    }}
  }});
}}
''', encoding="utf-8")
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp(omp, [omp, "--mode", "tui", "--no-extensions", "--no-prewalk", "--no-title", "--no-session",
                        "--extension", str(root), "--extension", str(fixture)])

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

    screens = {}
    try:
        for name, rows, cols in (("normal", 32, 110), ("narrow", 18, 52)):
            resize(rows, cols)
            screens[name] = visible(capture(2))
            if "AGAD" not in screens[name] or "Next:" not in screens[name]:
                raise RuntimeError(f"{name}-width panel not observed after resize")
        resize(32, 110)
        os.write(fd, b"/agad-ui-smoke\r")
        screens["question"] = visible(capture(3))
        if "Approve" not in screens["question"] or "Chat about this" not in screens["question"]:
            raise RuntimeError("real rich question did not display ordinary answer and Decision Partner action")
        # The native ask dialog lists the two original answers, details, then consultation.
        os.write(fd, b"\x1b[B\x1b[B\x1b[B\r")
        screens["consultation"] = visible(capture(2))
        if "Decision Partner" not in screens["consultation"]:
            raise RuntimeError("consultation input did not open from the native question action")
        os.write(fd, b"\x1b")
        screens["consultation-cancel"] = visible(capture(2))
        if "Approve" not in screens["consultation-cancel"]:
            raise RuntimeError("Escape from consultation did not return to the same question")
        os.write(fd, b"\x1b[B\x1b[B\r")
        screens["details"] = visible(capture(3))
        for marker in ("smoke exact reason", "src/production.ts", "tests/smoke-ui.py", "fixture evidence"):
            if marker not in screens["details"]:
                raise RuntimeError(f"full details view omitted expected payload field: {marker}")
        os.write(fd, b"\x1b")
        screens["details-return"] = visible(capture(2))
        if "Approve" not in screens["details-return"]:
            raise RuntimeError("Escape from details did not return to the unchanged question")
        os.write(fd, b"\r")
        screens["answer"] = visible(capture(2))
        if not result_path.exists():
            raise RuntimeError("explicit ordinary answer did not complete temporary fixture command")
        outcome = json.loads(result_path.read_text(encoding="utf-8"))
        if outcome.get("answer", {}).get("selected") != "Approve" or outcome.get("consultation"):
            raise RuntimeError(f"unexpected fixture answer/consultation result: {outcome}")
    finally:
        try:
            os.write(fd, b"\x03")
        except OSError:
            pass
        try:
            deadline = time.monotonic() + 4
            ended = False
            while time.monotonic() < deadline:
                try:
                    child, _ = os.waitpid(pid, os.WNOHANG)
                except ChildProcessError:
                    ended = True
                    break
                if child:
                    ended = True
                    break
                time.sleep(0.05)
            if not ended:
                os.kill(pid, signal.SIGTERM)
                os.waitpid(pid, 0)
        finally:
            os.close(fd)
    for name, screen in screens.items():
        print(f"{name}: {len(screen)} printable chars; {screen[-350:]}")
    print("PASS: real AGAD askPending and native OMP rich dialog exercised in normal/narrow TUI; consultation and details escaped back unchanged; explicit answer recorded; no model call.")
