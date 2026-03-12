#!/usr/bin/env python3
"""Simple dev server with CORS proxy for ri.healthinspections.us"""

import http.server
import urllib.request
import urllib.error

PORT = 8080
PROXY_PREFIX = "/api-proxy/"
UPSTREAM = "https://ri.healthinspections.us/ri/API/index.cfm/"


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith(PROXY_PREFIX):
            upstream_path = self.path[len(PROXY_PREFIX):]
            url = UPSTREAM + upstream_path
            try:
                req = urllib.request.Request(url, headers={
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "https://ri.healthinspections.us/",
                })
                with urllib.request.urlopen(req, timeout=10) as resp:
                    body = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(body)
            except urllib.error.HTTPError as e:
                self.send_error(e.code, str(e))
            except Exception as e:
                self.send_error(502, str(e))
        else:
            super().do_GET()

    def log_message(self, fmt, *args):
        print(fmt % args)


if __name__ == "__main__":
    with http.server.HTTPServer(("", PORT), Handler) as httpd:
        print(f"Serving on http://localhost:{PORT}")
        httpd.serve_forever()
