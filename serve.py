#!/usr/bin/env python3
"""Tiny static server with no-cache headers.

`python3 -m http.server` lets the browser aggressively cache JS modules, so code
edits don't show up without a hard reload. This server sends no-cache headers so
every load is fresh — just run it and refresh normally.

    python3 serve.py [port]   # default 8777
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print(f"Generative Hours → http://localhost:{port}/  (no-cache)")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
