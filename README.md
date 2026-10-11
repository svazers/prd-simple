# SvazerPRD

Landing page + chat AI (4 mode) untuk PRD, desain, dan coding. Next.js static export + satu server Python stdlib yang menyajikan `out/` sekaligus mem-proxy API AI (kunci tidak pernah sampai ke browser).

## Jalankan

```bash
# 1) build frontend (static export ke out/)
npm install
npx next build

# 2) siapkan kunci API
cp .env.example .env   # lalu isi API_KEY

# 3) jalankan server (port 9123)
python3 server.py
```

Buka http://127.0.0.1:9123

## Konfigurasi

Hanya **`API_KEY`** yang ada di `.env`. Sisanya adalah konstanta di `server.py`:

| Konstanta | Nilai |
|---|---|
| `API_BASE` | `https://api.apinex.bond/v1` |
| `DAILY_LIMIT` | 20 request/IP/hari |
| `MAX_TOKENS` | 0 (tanpa batas — parameter tidak dikirim) |
| `PORT` | 9123 |
| `MODELS` | 5 model free (GPT 6 Luna, GLM-5.3 Flash, Deepseek V4.1 Flash, Deepseek V4 Pro, Mimo V2.6 Pro) |
| `DEFAULT_MODEL` | GPT 6 Luna |

## Endpoint

- `GET /api/health` → `{"ok": true, "key": true}`
- `GET /api/models` → daftar model + limit harian
- `POST /api/chat` → SSE streaming (frame: `delta` · `tool` · `reasoning` · `notice` · `done` · `error`)
- `POST /api/feedback` → catat rating 👍/👎 ke `.feedback.jsonl`

## Tes

```bash
python3 server.py --selftest        # cek konfigurasi + izin tulis
node tests/md_renderer.test.js      # cek renderer markdown
```

## Deploy

### Vercel

Repo ini sudah siap deploy ke Vercel (static export + serverless function pengganti `server.py`):

1. Import repo di Vercel.
2. Set environment variable **`API_KEY`** (Settings → Environment Variables). Tanpa ini, `/api/chat` membalas 500 `API_KEY belum diisi di Vercel env`.
3. Deploy. `vercel.json` sudah mengarahkan `/api/chat`, `/api/models`, `/api/health`, `/api/feedback` ke `api/index.py`.

Catatan: di Vercel tidak ada kuota per-IP (serverless tanpa state bersama) — tambahkan Upstash/Vercel KV kalau perlu.

### VPS / tunnel

Static export (`out/`) bisa di-host di mana saja. Untuk fitur chat, `server.py` harus jalan di belakang reverse proxy + tunnel (cloudflared quick tunnel sudah teruji).
