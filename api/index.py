#!/usr/bin/env python3
"""Vercel serverless function: /api/<route> → SvazerPRD.

Mirrors the chat surface of server.py as one dynamic handler
(api/[...route].js in Vercel's catch-all convention), so the static export on
Vercel has a working backend. The provider key lives in the Vercel project env
var API_KEY and never reaches the browser.

Routes: GET /api/health · GET /api/models · POST /api/chat (SSE) · POST /api/feedback
"""
import json
import os
import re
import urllib.error
import urllib.request

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36")

# Same fixed config as server.py (only API_KEY comes from the environment).
API_BASE = "https://api.apinex.bond/v1"
DAILY_LIMIT = 20
TIMEOUT = 180
DEFAULT_MODEL = "GPT 6 Luna"
MODELS = {
    "GPT 6 Luna": "free/gpt-6-luna",
    "GLM-5.3 Flash": "free/glm-5.3-flash",
    "Deepseek V4.1 Flash": "free/deepseek-v4.1-flash",
    "Deepseek V4 Pro": "free/deepseek-v4-pro-0813",
    "Mimo V2.6 Pro": "free/mimo-v2.6-pro",
}
API_KEY = os.environ.get("API_KEY", "")

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


def _run_tool(name, args):
    if name == "get_datetime":
        from datetime import datetime, timedelta, timezone
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
                raw = r.read(200_000).decode(errors="replace")
            if "html" in ctype:
                raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", raw, flags=re.S | re.I)
                raw = re.sub(r"<[^>]+>", " ", raw)
            return re.sub(r"\s+", " ", raw)[:8000]
        except Exception as e:
            return "error: %s" % e
    return "error: tool tidak dikenal"


def _upstream(payload, key):
    """POST the chat payload and yield parsed SSE objects."""
    req = urllib.request.Request(
        API_BASE + "/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key,
                 "User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        for raw in r:
            line = raw.decode(errors="replace").strip()
            if not line.startswith("data:"):
                continue
            body = line[5:].strip()
            if not body or body == "[DONE]":
                continue
            try:
                yield json.loads(body)
            except ValueError:
                continue


def _sse(obj):
    return "data: " + json.dumps(obj) + "\n\n"


def handler(event, context):
    """Vercel Python entrypoint. route comes from the ?route= rewrite param."""
    qs = event.get("queryStringParameters") or {}
    route = [p for p in (qs.get("route") or "").split("/") if p]
    return _handler(route, event)


def _handler(route, event):
    """AWS-Lambda-shaped entry point (Vercel Python runtime)."""
    method = (event.get("requestContext", {}).get("http", {}) or {}).get("method") \
        or event.get("httpMethod", "GET")

    if route == ["health"]:
        return _json(200, {"ok": True, "key": bool(API_KEY)})

    if route == ["models"]:
        return _json(200, {"models": [{"name": n, "id": i} for n, i in MODELS.items()],
                           "default": DEFAULT_MODEL, "limit": DAILY_LIMIT})

    if route == ["feedback"] and method == "POST":
        return _json(200, {"ok": True})

    if route == ["chat"] and method == "POST":
        if not API_KEY:
            return _json(500, {"error": "config", "message": "API_KEY belum diisi di Vercel env"})
        try:
            body = json.loads(event.get("body") or "{}")
        except ValueError:
            return _json(400, {"error": "bad request"})
        mode = body.get("mode", "svazer")
        model_id = MODELS.get(body.get("model") or DEFAULT_MODEL, body.get("model") or DEFAULT_MODEL)
        messages = [{"role": "system", "content": PROMPTS.get(mode, PROMPTS["svazer"])}]
        messages += [
            {"role": m["role"], "content": str(m["content"])[:8000]}
            for m in body.get("messages", [])
            if m.get("role") in ("user", "assistant")
        ][-12:]
        if not messages or messages[-1]["role"] != "user":
            return _json(400, {"error": "bad request", "message": "pesan kosong"})

        use_tools = bool(body.get("tools"))
        # ponytail: no quota on Vercel (no shared store in a serverless function);
        # add Upstash/Vercel KV if abuse shows up.
        frames = []
        try:
            for _round in range(MAX_TOOL_ROUNDS + 1):
                payload = {"model": model_id, "messages": messages,
                           "temperature": 0.7, "stream": True}
                if use_tools:
                    payload["tools"] = TOOLS
                parts, tool_calls, finish = [], {}, None
                for chunk in _upstream(payload, API_KEY):
                    if not chunk.get("choices"):
                        continue
                    ch = chunk["choices"][0]
                    delta = ch.get("delta") or {}
                    if delta.get("content"):
                        parts.append(delta["content"])
                        frames.append(_sse({"type": "delta", "text": delta["content"]}))
                    for tc in delta.get("tool_calls") or []:
                        idx = tc.get("index", 0)
                        slot = tool_calls.setdefault(idx, {"id": "", "name": "", "args": ""})
                        if tc.get("id"):
                            slot["id"] = tc["id"]
                        fn = tc.get("function") or {}
                        slot["name"] += fn.get("name") or ""
                        slot["args"] += fn.get("arguments") or ""
                    if ch.get("finish_reason"):
                        finish = ch["finish_reason"]
                if finish == "length":
                    frames.append(_sse({"type": "notice",
                                        "text": "Jawaban terpotong karena mencapai batas panjang. "
                                                "Ketik 'lanjutkan' untuk melanjutkan."}))
                if finish != "tool_calls" or not tool_calls:
                    break
                messages.append({
                    "role": "assistant", "content": "".join(parts) or None,
                    "tool_calls": [
                        {"id": s["id"] or "call_%d" % i, "type": "function",
                         "function": {"name": s["name"], "arguments": s["args"] or "{}"}}
                        for i, s in sorted(tool_calls.items())
                    ],
                })
                for i, s in sorted(tool_calls.items()):
                    try:
                        result = _run_tool(s["name"], json.loads(s["args"] or "{}"))
                    except Exception as e:
                        result = "error: %s" % e
                    frames.append(_sse({"type": "tool", "name": s["name"],
                                        "args": s["args"] or "{}", "result": result[:500]}))
                    messages.append({"role": "tool", "tool_call_id": s["id"] or "call_%d" % i,
                                     "content": result[:4000]})
            frames.append(_sse({"type": "done"}))
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            frames.append(_sse({"type": "error", "message": "Provider error: " + detail}))
        except Exception as e:
            frames.append(_sse({"type": "error", "message": "Provider unreachable: %s" % e}))

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "text/event-stream; charset=utf-8",
                        "Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            "body": "".join(frames),
        }

    return _json(404, {"error": "not found"})


def _json(code, obj):
    return {"statusCode": code,
            "headers": {"Content-Type": "application/json; charset=utf-8"},
            "body": json.dumps(obj)}
