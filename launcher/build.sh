#!/bin/bash
# Build file chạy cho Windows (không cần cài gì thêm trên máy Windows). Cần Go: https://go.dev/dl
# Chạy: bash launcher/build.sh   →   tạo "Word Arena.exe" ở thư mục gốc của game.
set -e
cd "$(dirname "$0")"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "../Word Arena.exe" .
echo "✓ Đã tạo: $(cd .. && pwd)/Word Arena.exe"
