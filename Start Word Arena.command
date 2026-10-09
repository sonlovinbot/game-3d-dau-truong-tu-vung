#!/bin/bash
# Bấm đúp file này để chạy Word Arena trên máy Mac: khởi động máy chủ và mở http://localhost:5290
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/serve.py
fi
echo "Máy chưa có python3. Hãy cài bằng lệnh:  xcode-select --install"
echo "Sau đó bấm đúp lại file này."
read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng..."
