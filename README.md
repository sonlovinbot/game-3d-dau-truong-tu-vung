# Word Arena · Đấu Trường Từ Vựng

Game 3D học từ vựng tiếng Anh cho học sinh K12, viết bằng Three.js (không cần build).
Chọn chủ đề và độ khó, đấu với bot: nghe phát âm một từ tiếng Anh rồi chọn nghĩa đúng trong **5 giây**.
Trả lời đúng và nhanh thì nhân vật của bạn đánh trúng bot.

## Chơi online

https://app.danghuuson.com/game-3d-dau-truong-tu-vung/ (GitHub Pages, nhánh `main`, thư mục gốc).

## Chạy game trên máy

Cần chạy qua một web server tĩnh (trình duyệt chặn ES module và file GLB khi mở trực tiếp bằng `file://`):

```bash
python3 -m http.server 5290
```

Mở `http://localhost:5290`. Cần Internet để tải Three.js từ CDN.

## Chạy game trên máy (một cú bấm)

| Hệ điều hành | Cách chạy |
|---|---|
| **macOS** | Bấm đúp **`Start Word Arena.command`** (cần `python3`, nếu chưa có: `xcode-select --install`). Lần đầu nếu bị chặn: chuột phải → Open. |
| **Windows** | Bấm đúp **`Word Arena.exe`** (không cần cài thêm gì). Nếu Windows SmartScreen cảnh báo: More info → Run anyway. |

Cả hai tự chọn cổng trống (từ 5290), mở trình duyệt tại `http://localhost:5290`, tắt bộ nhớ đệm (luôn thấy bản mới khi sửa code) và không phục vụ file ẩn như `.env`. Bấm lần hai khi đang chạy chỉ mở lại trình duyệt.
Tạo lại `Word Arena.exe` (cần [Go](https://go.dev/dl)): `bash launcher/build.sh`. File `.exe` không đưa vào git.

Chạy thủ công: `python3 scripts/serve.py`, hoặc `python3 -m http.server 5290`.

## Cách chơi

- 4 chủ đề (Động vật, Đồ ăn, Trường học, Gia đình) × 3 độ khó (Dễ, Trung bình, Khó), mỗi trận 10 câu.
- Mỗi câu: nghe phát âm, chọn 1 trong 4 nghĩa. Bấm chuột/chạm, hoặc phím `1`–`4`.
- Ai đúng thì tấn công; cả hai đúng thì ai nhanh hơn thắng. Trả lời dưới 1,6 giây là chí mạng, đúng liên tiếp thì ra đòn tối thượng.
- Cuối trận có danh sách từ sai để nghe lại.

## Cấu trúc

| Đường dẫn | Việc nó làm |
|---|---|
| `index.html`, `css/style.css` | Giao diện: menu, HUD, kết quả |
| `js/main.js` | Điều phối menu → trận đấu → kết quả |
| `js/battle.js` | Luật chơi và bot (không phụ thuộc đồ hoạ) |
| `js/words.js` | Dữ liệu từ vựng, thêm từ/chủ đề tại đây |
| `js/scene.js` | Đấu trường 3D, camera, các kiểu đòn đánh |
| `js/characters.js` | Nhân vật: nạp GLB, gán animation, bot dựng bằng code |
| `js/fx.js` | Hiệu ứng chiến đấu (tia sáng, vòng xung kích, laser, thiên thạch…) |
| `js/audio.js` | Hiệu ứng âm thanh, nhạc nền, giọng đọc (Web Speech API) |
| `assets/` | Nhân vật GLB |
| `game sound/` | Âm thanh dùng trong game |

## Nhân vật GLB

- Game tự nạp `assets/hero.web.glb`, không có thì dùng `assets/hero.glb`. Có thể kéo thả file `.glb` vào trang để xem thử.
- Clip được gán theo tên (xem `CLIP_RULES` trong `js/characters.js`): `idle`, `run`, `attack` (box), `hit`, `win`, `lose`.
- Model nhìn lệch hướng: thêm `?heroRot=90` (hoặc `-90`, `180`) vào URL.
- Tạo bản nhẹ cho web từ file gốc:

```bash
cd assets && npx -y @gltf-transform/cli@4 optimize hero.glb hero.web.glb --compress false --texture-compress webp --texture-size 1024 --simplify true --simplify-ratio 0.3 --simplify-error 0.002
```

## Âm thanh

Các file trong `game sound/` lấy từ [Mixkit](https://mixkit.co/license/#sfxFree). Hãy kiểm tra giấy phép của Mixkit trước khi công khai repo hoặc phát hành game.

## Tài khoản và dữ liệu (Supabase)

1. Điền `.env` (xem `.env.example`) rồi chạy `node scripts/make-config.mjs` để sinh `js/config.js`.
2. Trong Supabase → **SQL Editor**, chạy lần lượt `supabase/schema.sql`, `supabase/seed_words.sql` rồi `supabase/02_settings.sql` (avatar, tóm tắt tiến độ, xoá tài khoản).
3. Supabase → **Authentication → URL Configuration**: thêm `http://localhost:5290` và địa chỉ GitHub Pages vào **Redirect URLs**.

`schema.sql` tạo các bảng hồ sơ, thống kê, trận đấu, tiến độ từng từ, huy hiệu và các hàm chấm điểm chạy trên server
(`start_match` → `fetch_question` → `submit_answer`). Trình duyệt chỉ đọc được dữ liệu của chính mình và không ghi trực tiếp được vào bảng điểm.
Sau khi sửa `js/words.js`, chạy `node scripts/make-seed.mjs` và chạy lại `seed_words.sql`.

## Trang Cài đặt

Bấm **⚙️ Cài đặt** ở góc màn hình (khi đã đăng nhập): đổi tên và avatar, đổi mật khẩu, bật/tắt hiệu ứng và nhạc nền,
xem điểm số, tiến độ học từng từ, huy hiệu, bảng xếp hạng và xoá tài khoản.
Xem trước giao diện bằng dữ liệu giả: tạo thư mục `dev/` (đã được `.gitignore`) rồi mở `dev/settings-preview.html`.

## Chơi online và chơi thử

- **Đã đăng nhập:** trận đấu chạy trên server (`js/session.js` → `OnlineSession`). Server chọn câu hỏi, đo giờ, chấm đúng/sai, tính điểm, lưu thống kê, tiến độ từng từ và huy hiệu.
- **Khách ("Chơi thử"):** tính hoàn toàn trong trình duyệt (`LocalSession`), không lưu gì. Người đã đăng nhập nhưng máy chủ chưa cài SQL cũng tự chuyển sang chế độ này và có thông báo.
- Chữ giao diện dùng **Be Vietnam Pro** (nội dung) và **Baloo 2** (tiêu đề), cả hai có đủ dấu tiếng Việt.

## Xuất bản (GitHub Pages)

`.github/workflows/pages.yml` tự deploy mỗi khi đẩy lên nhánh `main` (hoặc chạy tay ở tab **Actions → Deploy to GitHub Pages → Run workflow**).
Yêu cầu: **Settings → Pages → Source = "GitHub Actions"**. Chỉ phần game được đưa lên web (không có `supabase/`, `scripts/`, `launcher/`, `.env*`, bản GLB gốc).
Nếu web không cập nhật: xem tab **Actions** của repo, lần chạy lỗi sẽ hiện màu đỏ kèm lý do.
