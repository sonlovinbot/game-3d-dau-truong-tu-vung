#!/usr/bin/env python3
"""Máy chủ cục bộ cho Word Arena (macOS/Linux): phục vụ thư mục game, tự chọn cổng trống, mở trình duyệt.
Chạy: python3 scripts/serve.py   (hoặc bấm đúp "Start Word Arena.command")
Hành vi giống Word Arena.exe: chặn file ẩn (.env, .git), tắt bộ nhớ đệm, không mở trùng nếu đã chạy sẵn."""
import mimetypes
import os
import sys
import threading
import time
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

FIRST_PORT, LAST_PORT = 5290, 5320
MARKER = "X-Word-Arena"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

for ext, typ in {
    ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".wav": "audio/wav",
    ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".webp": "image/webp",
}.items():
    mimetypes.add_type(typ, ext)


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        if any(seg.startswith(".") for seg in self.path.split("?")[0].split("/") if seg):
            self.send_error(404, "Not found")  # không phục vụ .env, .git...
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # luôn thấy bản mới nhất khi đang sửa code
        self.send_header(MARKER, "1")
        super().end_headers()

    def log_message(self, fmt, *args):
        if os.environ.get("WORD_ARENA_VERBOSE"):
            super().log_message(fmt, *args)


def already_running(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/index.html", timeout=0.7) as r:
            return r.headers.get(MARKER) == "1"
    except Exception:
        return False


def open_browser(url):
    if not os.environ.get("WORD_ARENA_NO_OPEN"):
        webbrowser.open(url)


def main():
    if not os.path.exists(os.path.join(ROOT, "index.html")):
        sys.exit(f"Không thấy index.html trong {ROOT}")
    if already_running(FIRST_PORT):
        url = f"http://localhost:{FIRST_PORT}/"
        print("Word Arena đang chạy sẵn tại", url, "- mở lại trình duyệt...")
        open_browser(url)
        return

    server = None
    for port in range(FIRST_PORT, LAST_PORT + 1):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=ROOT))
            break
        except OSError:
            continue
    if server is None:
        sys.exit(f"Không tìm được cổng trống trong khoảng {FIRST_PORT}-{LAST_PORT}.")

    url = f"http://localhost:{port}/"
    print("==============================================")
    print("  Word Arena - Đấu Trường Từ Vựng")
    print("==============================================")
    print("  Thư mục :", ROOT)
    print("  Địa chỉ :", url)
    print()
    print("  Trình duyệt sẽ tự mở. Giữ cửa sổ này mở khi chơi.")
    print("  Đóng cửa sổ (hoặc nhấn Ctrl+C) để tắt máy chủ.")
    print("==============================================")
    threading.Thread(target=lambda: (time.sleep(0.5), open_browser(url)), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã tắt máy chủ.")


if __name__ == "__main__":
    main()
