"""Load the installed OMP host and query state/commands; never send a model prompt."""
import json
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[1]
requests = '\n'.join(json.dumps({'id': key, 'type': key}) for key in ('get_state', 'get_commands')) + '\n'
result = subprocess.run(['omp','--mode','rpc','--no-title','--no-session','--no-extensions','--extension',str(root)], input=requests, text=True, capture_output=True, timeout=45)
frames=[]
for line in result.stdout.splitlines():
    try: frames.append(json.loads(line))
    except ValueError: pass
serialized=json.dumps(frames)
if result.returncode or 'agad-status' not in serialized or 'agad-question' not in serialized:
    print(result.stdout[-6000:]);print(result.stderr[-4000:]);raise SystemExit('OMP RPC plugin smoke check failed')
state=next((frame.get('data',{}) for frame in frames if frame.get('command')=='get_state'),{})
assert state.get('model',{}).get('id') == 'gpt-6.1-sol', state
assert state.get('thinkingLevel') == 'high', state
print('Installed OMP loaded the plugin, mapped Architect to Sol High, and registered both commands. No model prompt was sent.')
