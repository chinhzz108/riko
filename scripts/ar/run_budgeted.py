"""Run one local CLI under the same two-CPU, idle-priority media budget."""
import subprocess
import sys
import resource_budget

if len(sys.argv) < 2:
    raise SystemExit("Usage: python scripts/ar/run_budgeted.py <command> [arguments]")
raise SystemExit(subprocess.call(sys.argv[1:]))
