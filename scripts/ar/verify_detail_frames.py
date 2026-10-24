"""Run the expensive comparisons sequentially under the laptop CPU budget."""
import runpy
from pathlib import Path
import resource_budget

folder = Path(__file__).resolve().parent
for script in ["verify_video_details.py", "verify_packed_alpha.py"]:
    print(f"Starting {script} (idle priority, two logical CPUs)", flush=True)
    runpy.run_path(str(folder / script), run_name="__main__")
print("All source and packed frame comparisons completed", flush=True)
