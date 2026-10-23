#!/usr/bin/env python3
"""Accept a local MindAR bundle upload from the dev-only compiler page."""

from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
DESTINATION = ROOT / "public/ar/book-pages.mind"


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "http://localhost:8443")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != "/targets":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length < 128 or length > 100_000_000:
            self.send_error(413, "Invalid MindAR bundle length")
            return
        data = self.rfile.read(length)
        DESTINATION.parent.mkdir(parents=True, exist_ok=True)
        DESTINATION.write_bytes(data)
        response = json.dumps({"path": str(DESTINATION), "bytes": len(data)}).encode()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


if __name__ == "__main__":
    print("MindAR bundle writer listening at http://localhost:8444/targets", flush=True)
    HTTPServer(("127.0.0.1", 8444), Handler).serve_forever()
