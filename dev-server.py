#!/usr/bin/env python3
"""Simple dev server with CORS proxy for ri.healthinspections.us"""

import http.server
import urllib.request
import urllib.error
import time

PORT = 8080
PROXY_PREFIX = "/api-proxy/"
UPSTREAM = "https://ri.healthinspections.us/ri/API/index.cfm/"

CACHE_TTL = 3600  # seconds (1 hour)
_cache = {}  # path -> (body, content_type, timestamp)


def cache_get(path):
    entry = _cache.get(path)
    if entry and (time.time() - entry[2]) < CACHE_TTL:
        return entry[0], entry[1]
    return None, None


def cache_set(path, body, content_type):
    _cache[path] = (body, content_type, time.time())


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith(PROXY_PREFIX):
            upstream_path = self.path[len(PROXY_PREFIX):]
            body, content_type = cache_get(upstream_path)
            if body is None:
                url = UPSTREAM + upstream_path
                try:
                    req = urllib.request.Request(url, headers={
                        "Accept": "application/json",
                        "User-Agent": "Mozilla/5.0",
                        "Referer": "https://ri.healthinspections.us/",
                    })
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        body = resp.read()
                        content_type = resp.headers.get("Content-Type", "application/json")
                        cache_set(upstream_path, body, content_type)
                except urllib.error.HTTPError as e:
                    self.send_error(e.code, str(e))
                    return
                except Exception as e:
                    self.send_error(502, str(e))
                    return
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, fmt, *args):
        print(fmt % args)


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Serving on http://localhost:{PORT}")
        httpd.serve_forever()
