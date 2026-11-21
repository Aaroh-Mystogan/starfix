"""Preview the Starfix website on your own computer.

    python serve.py

Opens http://localhost:8000 in your browser. (Browsers won't load the model files from a
page opened straight from disk, which is why this small server exists. Online, your host
does this job.) Press Ctrl+C to stop.
"""
import functools
import http.server
import os
import socketserver
import threading
import webbrowser

PORT = int(os.environ.get("PORT", 8000))
SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".json": "application/json"}

    def log_message(self, *args):
        pass


def main():
    handler = functools.partial(Handler, directory=SITE)
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        url = f"http://localhost:{PORT}/"
        print(f"Starfix is running at {url}  (Ctrl+C to stop)")
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
