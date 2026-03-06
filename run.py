"""
Entry point for the AI Content Agent.

Run from the project root:
    python run.py

Then open http://localhost:5000 in your browser.
"""

import os
import sys
from pathlib import Path

# Ensure the project root is on the Python path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from backend.app import app

if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"

    print(f"""
╔══════════════════════════════════════════════════╗
║        AI Content Agent — starting up            ║
╠══════════════════════════════════════════════════╣
║  URL   →  http://localhost:{port:<22}║
║  Debug →  {str(debug):<38}║
╚══════════════════════════════════════════════════╝
""")
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=False)
