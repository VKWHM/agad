"""OMP transport to the unchanged, harness-independent core validator."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'tools'))
from validate import GovernanceError, validate
try:
    print(json.dumps({'phase': validate(json.load(sys.stdin))}))
except (GovernanceError, ValueError, OSError) as error:
    print(str(error), file=sys.stderr)
    sys.exit(1)
