#!/usr/bin/env python3
"""A tiny dependency-free local server for 浮光微境 / Floating Terrarium.

Why not `python3 -m http.server`? This handler explicitly serves module
scripts, source maps and local font files with the right MIME types and keeps
the page cache warm for the bundled Three.js / font assets.

Usage:
    python3 server.py [port]
"""

from __future__ import annotations

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
DEFAULT_PORT = 4179


class TerrariumHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".mjs": "text/javascript",
        ".task": "application/octet-stream",
        ".woff2": "font/woff2",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/vendor/") or path.startswith("/assets/"):
            # Large, versioned runtime files are safe to keep for a while.
            self.send_header("Cache-Control", "public, max-age=3600")
        else:
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep terminal output quiet except for real failures.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


def main() -> None:
    try:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    except ValueError:
        print("端口需要是一个数字，例如：python3 server.py 4179")
        raise SystemExit(2)

    try:
        server = ThreadingHTTPServer((HOST, port), TerrariumHandler)
    except OSError as error:
        print(f"无法在 {HOST}:{port} 启动：{error}")
        print("端口可能被占用，换一个端口再试：python3 server.py 4180")
        raise SystemExit(1)

    print()
    print("  浮光微境 · A Floating Terrarium")
    print(f"  → http://{HOST}:{port}")
    print("  按 Ctrl+C 停止服务")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n微境已合上。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
