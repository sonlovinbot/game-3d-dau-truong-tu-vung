// Máy chủ cục bộ cho Word Arena: phục vụ thư mục chứa file này, tự chọn cổng trống và mở trình duyệt.
// Build: xem launcher/build.sh. Đặt file .exe cạnh index.html rồi bấm đúp để chạy.
package main

import (
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	firstPort = 5290
	lastPort  = 5320
	marker    = "X-Word-Arena"
)

func main() {
	setupConsole()
	dir, err := projectDir()
	if err != nil {
		fatal(err.Error())
	}

	// Một số hệ thống thiếu kiểu MIME cho file 3D / âm thanh / module
	for ext, typ := range map[string]string{
		".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".wav": "audio/wav",
		".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
		".css": "text/css; charset=utf-8", ".webp": "image/webp", ".svg": "image/svg+xml",
	} {
		_ = mime.AddExtensionType(ext, typ)
	}

	// Đã có một bản đang chạy ở cổng đầu tiên? Chỉ cần mở lại trình duyệt.
	if isRunning(firstPort) {
		url := fmt.Sprintf("http://localhost:%d/", firstPort)
		fmt.Println("Word Arena đang chạy sẵn tại", url, "- mở lại trình duyệt...")
		openBrowser(url)
		time.Sleep(1500 * time.Millisecond)
		return
	}

	var ln net.Listener
	port := 0
	for p := firstPort; p <= lastPort; p++ {
		if l, e := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p)); e == nil {
			ln, port = l, p
			break
		}
	}
	if ln == nil {
		fatal(fmt.Sprintf("Không tìm được cổng trống trong khoảng %d-%d.", firstPort, lastPort))
	}

	url := fmt.Sprintf("http://localhost:%d/", port)
	fmt.Println("==============================================")
	fmt.Println("  Word Arena - Đấu Trường Từ Vựng")
	fmt.Println("==============================================")
	fmt.Println("  Thư mục :", dir)
	fmt.Println("  Địa chỉ :", url)
	fmt.Println()
	fmt.Println("  Trình duyệt sẽ tự mở. Giữ cửa sổ này mở khi chơi.")
	fmt.Println("  Đóng cửa sổ (hoặc nhấn Ctrl+C) để tắt máy chủ.")
	fmt.Println("==============================================")

	go func() {
		time.Sleep(500 * time.Millisecond)
		openBrowser(url)
	}()

	srv := &http.Server{Handler: handler(dir)}
	if err := srv.Serve(ln); err != nil {
		fatal(err.Error())
	}
}

// handler: chặn file ẩn (.env, .git...), tắt bộ nhớ đệm để luôn thấy bản mới nhất khi đang sửa code.
func handler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, seg := range strings.Split(r.URL.Path, "/") {
			if strings.HasPrefix(seg, ".") && seg != "" {
				http.NotFound(w, r)
				return
			}
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set(marker, "1")
		files.ServeHTTP(w, r)
	})
}

func projectDir() (string, error) {
	var candidates []string
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Dir(exe))
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, cwd, filepath.Dir(cwd))
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "index.html")); err == nil {
			return c, nil
		}
	}
	return "", fmt.Errorf("không thấy index.html. Hãy đặt file này cạnh index.html của game rồi chạy lại")
}

func isRunning(port int) bool {
	c := http.Client{Timeout: 700 * time.Millisecond}
	resp, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/index.html", port))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.Header.Get(marker) == "1"
}

func openBrowser(url string) {
	if os.Getenv("WORD_ARENA_NO_OPEN") != "" { // dùng khi kiểm thử
		return
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		fmt.Println("Không tự mở được trình duyệt. Hãy mở:", url)
	}
}

func fatal(msg string) {
	fmt.Println()
	fmt.Println("LỖI:", msg)
	fmt.Println("Nhấn Enter để đóng...")
	_, _ = fmt.Scanln()
	os.Exit(1)
}
