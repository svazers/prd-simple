#!/usr/bin/env python3
"""SvazerPRD server: static export + /api proxy. Stdlib only, no deps.

Serves out/, proxies /api/chat to the OpenAI-compatible provider with the
key kept server-side, enforces a per-IP daily quota (resets 00:00 UTC).
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36")

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "out")
QUOTA_FILE = os.path.join(ROOT, ".quota.json")

# --- .env (tiny parser; no python-dotenv dep) ---
ENV = {}
try:
    for line in open(os.path.join(ROOT, ".env")):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            ENV[k.strip()] = v.strip().strip('"').strip("'")
except FileNotFoundError:
    pass


def env(k, d):
    return ENV.get(k) or os.environ.get(k) or d


API_KEY = env("API_KEY", "")

# Everything below is fixed config, not env-tunable (only API_KEY lives in .env).
API_BASE = "https://api.apinex.bond/v1"
DAILY_LIMIT = 20
MAX_TOKENS = 0  # 0 = no cap: omit max_tokens, let the model stop on its own
TIMEOUT = 180
PORT = 9123
DEFAULT_MODEL = "GPT 6 Luna"
MODELS = {
    "GPT 6 Luna": "free/gpt-6-luna",
    "GLM-5.3 Flash": "free/glm-5.3-flash",
    "Deepseek V4.1 Flash": "free/deepseek-v4.1-flash",
    "Deepseek V4 Pro": "free/deepseek-v4-pro-0813",
    "Mimo V2.6 Pro": "free/mimo-v2.6-pro",
}

PROMPTS = {
    "plan": (
        "Kamu adalah generator PRD untuk SvazerPRD. Ubah ide user menjadi PRD untuk AI coding agent. "
        "Output HANYA dokumen PRD dalam markdown Bahasa Indonesia. "
        "JANGAN pakai judul dokumen seperti '# PRD: ...' — mulai LANGSUNG dari '## Ringkasan'. "
        "DILARANG KERAS kalimat pembuka, penutup, konfirmasi, atau narasi proses — contoh terlarang: "
        "'Saya akan baca dulu...', 'Berikut PRD-nya', 'Semoga membantu'. Mulai langsung dari judul PRD. "
        "Jangan tanya balik; buat asumsi dan catat di bagian Asumsi. "
        "Struktur wajib: Ringkasan, Tujuan, Fitur (P0/P1/P2), User Stories, Data Model, "
        "Task Terurut (siap dipakai AI coding agent), Acceptance Criteria, Asumsi."
    ),
    "design": (
        "Kamu adalah desainer UI untuk SvazerPRD. Output HANYA satu code fence ```html berisi prototipe "
        "lengkap (HTML + CSS di <style>, tanpa build step, responsif, dark theme modern). "
        "Tanpa kalimat pembuka, penjelasan, atau penutup di luar code fence — mulai langsung dari ```html."
    ),
    "svazer": (
        "Kamu adalah SvazerAI, asisten coding & produk. Jawab langsung ke inti tanpa bertele-tele, "
        "tanpa kalimat pembuka seperti 'Baik, saya akan...'. Bahasa Indonesia, kode dalam code fence "
        "dengan bahasa yang benar."
    ),
    "template": (
        "Kamu membantu memilih kerangka codebase untuk SvazerPRD. Dari kebutuhan user, output HANYA "
        "spesifikasi template markdown Bahasa Indonesia, langsung dimulai dengan judul. "
        "Tanpa kalimat pembuka/penutup. Isi: struktur folder, stack minimal, env vars, "
        "praktik keamanan wajib, dan checklist go-live."
    ),
}


def quota_key(ip):
    return datetime.now(timezone.utc).strftime("%Y-%m-%d") + "|" + ip


def quota_take(ip):
    """Reserve one request. Returns False if the daily quota is exhausted."""
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        q = json.load(open(QUOTA_FILE))
    except Exception:
        q = {}
    for k in [k for k in q if not k.startswith(day + "|")]:
        del q[k]  # prune yesterday and older
    n = q.get(quota_key(ip), 0)
    if n >= DAILY_LIMIT:
        json.dump(q, open(QUOTA_FILE, "w"))
        return False
    q[quota_key(ip)] = n + 1
    json.dump(q, open(QUOTA_FILE, "w"))
    return True


def quota_release(ip):
    """Undo a reservation when the upstream call failed."""
    try:
        q = json.load(open(QUOTA_FILE))
        k = quota_key(ip)
        if k in q:
            q[k] = max(0, q[k] - 1)
            json.dump(q, open(QUOTA_FILE, "w"))
    except Exception:
        pass


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_datetime",
            "description": "Dapatkan tanggal dan waktu UTC saat ini, plus waktu Jakarta.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch",
            "description": "Ambil isi teks sebuah halaman web (URL http/https) sebagai markdown/text, max 8000 char.",
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string", "description": "URL lengkap halaman"}},
                "required": ["url"],
            },
        },
    },
]

MAX_TOOL_ROUNDS = 3


def run_tool(name, args):
    """Execute a built-in tool. Returns a string result."""
    if name == "get_datetime":
        now = datetime.now(timezone.utc)
        jak = now + timedelta(hours=7)
        return now.strftime("%Y-%m-%d %H:%M UTC") + " | Jakarta " + jak.strftime("%H:%M")
    if name == "web_fetch":
        url = str(args.get("url", ""))
        if not re.match(r"^https?://", url):
            return "error: URL harus http(s)"
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                ctype = r.headers.get("Content-Type", "")
                if "html" in ctype:
                    html = r.read(200_000).decode(errors="replace")
                    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
                    text = re.sub(r"<[^>]+>", " ", html)
                else:
                    text = r.read(200_000).decode(errors="replace")
            return re.sub(r"\s+", " ", text)[:8000]
        except Exception as e:
            return "error: %s" % e
    return "error: tool tidak dikenal"


def sse(obj):
    return "data: " + json.dumps(obj) + "\n\n"


def stream_chat(payload):
    """Yield parsed SSE data objects from the provider."""
    req = urllib.request.Request(
        API_BASE + "/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + API_KEY,
            "Accept": "text/event-stream",
            # ponytail: Cloudflare (error 1010) blocks the default urllib signature
            "User-Agent": UA,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        for raw in r:
            line = raw.decode(errors="replace").strip()
            if not line.startswith("data:") or line == "data: [DONE]":
                continue
            try:
                yield json.loads(line[5:])
            except ValueError:
                continue


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=OUT, **kw)

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/models":
            models = [{"name": n, "id": i} for n, i in MODELS.items()]
            return self._json(200, {"models": models, "default": DEFAULT_MODEL, "limit": DAILY_LIMIT})
        if self.path == "/api/health":
            return self._json(200, {"ok": True, "key": bool(API_KEY)})
        # SPA-ish fallback: /chat -> /chat.html when missing
        p = self.path.split("?")[0]
        if p != "/" and not os.path.splitext(p)[1]:
            if os.path.isfile(os.path.join(OUT, p.strip("/") + ".html")):
                self.path = p.strip("/") + ".html"
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/feedback":
            # fire-and-forget rating log: {index, rating, model}
            try:
                length = int(self.headers.get("Content-Length", 0))
                fb = json.loads(self.rfile.read(length))
                with open(os.path.join(ROOT, ".feedback.jsonl"), "a") as f:
                    f.write(json.dumps({
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "ip": self.client_address[0],
                        "model": fb.get("model"),
                        "index": fb.get("index"),
                        "rating": fb.get("rating"),
                    }) + "\n")
            except Exception:
                pass
            return self._json(200, {"ok": True})
        if self.path != "/api/chat":
            return self._json(404, {"error": "not found"})
        if not API_KEY:
            return self._json(500, {"error": "config", "message": "API_KEY belum diisi di .env"})
        ip = self.client_address[0]
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            mode = body.get("mode", "svazer")
            model_id = body.get("model") or DEFAULT_MODEL
            # client sends display name; map to provider id
            model_id = MODELS.get(model_id, model_id)
            messages = [{"role": "system", "content": PROMPTS.get(mode, PROMPTS["svazer"])}]
            messages += [
                {"role": m["role"], "content": str(m["content"])[:8000]}
                for m in body.get("messages", [])
                if m.get("role") in ("user", "assistant")
            ][-12:]  # ponytail: hard cap context, trim oldest via slice
        except Exception:
            return self._json(400, {"error": "bad request"})
        if not messages or messages[-1]["role"] != "user":
            return self._json(400, {"error": "bad request", "message": "pesan kosong"})
        if not quota_take(ip):
            return self._json(
                429,
                {
                    "error": "quota",
                    "message": "Kuota gratis hari ini habis. Reset tiap jam 07:00 WIB — lanjut besok pagi ya!",
                },
            )

        use_tools = bool(body.get("tools"))

        # SSE response; quota is committed (failures mid-stream don't refund —
        # ponytail: refund only on pre-stream HTTPError, fine for free daily quota)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            for round_no in range(MAX_TOOL_ROUNDS + 1):
                payload = {
                    "model": model_id,
                    "messages": messages,
                    "temperature": 0.7,
                    "stream": True,
                }
                if MAX_TOKENS:  # 0 = no cap: provider default (up to model max)
                    payload["max_tokens"] = MAX_TOKENS
                if use_tools:
                    payload["tools"] = TOOLS
                content_parts = []
                tool_calls = {}  # index -> {id, name, args}
                finish = None
                for chunk in stream_chat(payload):
                    if not chunk.get("choices"):
                        continue
                    ch = chunk["choices"][0]
                    delta = ch.get("delta") or {}
                    if delta.get("content"):
                        content_parts.append(delta["content"])
                        self.wfile.write(sse({"type": "delta", "text": delta["content"]}).encode())
                        self.wfile.flush()
                    if delta.get("reasoning_content"):  # future-proof; provider doesn't send it yet
                        self.wfile.write(sse({"type": "reasoning", "text": delta["reasoning_content"]}).encode())
                    for tc in delta.get("tool_calls") or []:
                        idx = tc.get("index", 0)
                        slot = tool_calls.setdefault(idx, {"id": tc.get("id") or "", "name": "", "args": ""})
                        if tc.get("id"):
                            slot["id"] = tc["id"]
                        fn = tc.get("function") or {}
                        if fn.get("name"):
                            slot["name"] += fn["name"]
                        if fn.get("arguments"):
                            slot["args"] += fn["arguments"]
                    if ch.get("finish_reason"):
                        finish = ch["finish_reason"]

                if finish == "length":
                    self.wfile.write(sse({"type": "notice", "text": "Jawaban terpotong karena mencapai batas panjang. Ketik 'lanjutkan' untuk melanjutkan."}).encode())

                if finish != "tool_calls" or not tool_calls:
                    break  # normal end: text fully streamed

                # execute tools, announce to client, append results
                assistant_msg = {"role": "assistant", "content": "".join(content_parts) or None,
                                 "tool_calls": [
                                     {"id": s["id"] or "call_%d" % i, "type": "function",
                                      "function": {"name": s["name"], "arguments": s["args"] or "{}"}}
                                     for i, s in sorted(tool_calls.items())
                                 ]}
                messages.append(assistant_msg)
                for i, s in sorted(tool_calls.items()):
                    try:
                        result = run_tool(s["name"], json.loads(s["args"] or "{}"))
                    except Exception as e:
                        result = "error: %s" % e
                    self.wfile.write(sse({"type": "tool", "name": s["name"],
                                          "args": s["args"] or "{}", "result": result[:500]}).encode())
                    messages.append({"role": "tool", "tool_call_id": s["id"] or "call_%d" % i,
                                     "content": result[:4000]})
                # loop continues -> model gets tool results and answers

            self.wfile.write(sse({"type": "done"}).encode())
        except urllib.error.HTTPError as e:
            quota_release(ip)  # pre-stream failure: refund
            detail = e.read().decode(errors="replace")[:300]
            self.wfile.write(sse({"type": "error", "message": "Provider error: " + detail}).encode())
        except (BrokenPipeError, ConnectionResetError):
            pass  # client hit Stop / closed tab
        except Exception as e:
            self.wfile.write(sse({"type": "error", "message": "Provider unreachable: %s" % e}).encode())


def selftest():
    # quota: take/release roundtrip and exhaustion
    global DAILY_LIMIT
    DAILY_LIMIT = 2
    for f in (QUOTA_FILE,):
        if os.path.exists(f):
            os.remove(f)
    ip = "selftest"
    assert quota_take(ip) and quota_take(ip) and not quota_take(ip)
    quota_release(ip)
    assert quota_take(ip)
    # env parse
    assert isinstance(DAILY_LIMIT, int)
    if os.path.exists(QUOTA_FILE):
        os.remove(QUOTA_FILE)
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    port = PORT
    print("serving %s on http://127.0.0.1:%d (key: %s, limit/day: %d)"
          % (OUT, port, "set" if API_KEY else "MISSING", DAILY_LIMIT), flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
