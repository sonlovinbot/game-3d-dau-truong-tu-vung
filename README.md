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
2. Trong Supabase → **SQL Editor**, chạy lần lượt `supabase/schema.sql` rồi `supabase/seed_words.sql`.
3. Supabase → **Authentication → URL Configuration**: thêm `http://localhost:5290` và địa chỉ GitHub Pages vào **Redirect URLs**.

`schema.sql` tạo các bảng hồ sơ, thống kê, trận đấu, tiến độ từng từ, huy hiệu và các hàm chấm điểm chạy trên server
(`start_match` → `fetch_question` → `submit_answer`). Trình duyệt chỉ đọc được dữ liệu của chính mình và không ghi trực tiếp được vào bảng điểm.
Sau khi sửa `js/words.js`, chạy `node scripts/make-seed.mjs` và chạy lại `seed_words.sql`.
