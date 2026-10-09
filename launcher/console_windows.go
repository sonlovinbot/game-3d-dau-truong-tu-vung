package main

import "syscall"

// Bật UTF-8 cho cửa sổ dòng lệnh Windows để hiện đúng tiếng Việt có dấu.
func setupConsole() {
	syscall.NewLazyDLL("kernel32.dll").NewProc("SetConsoleOutputCP").Call(65001)
}
