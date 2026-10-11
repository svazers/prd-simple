/**
 * Vercel serverless backend for SvazerPRD (one dynamic route: /api/[route]).
 *
 * The Next.js app is a static export (output: "export"), so it has no server of
 * its own. This function is the Vercel adapter for server.py's chat surface:
 * the provider key lives in the Vercel env var API_KEY and never reaches the
 * browser. Local/VPS deployments keep using server.py.
 *
 * Routes: GET /api/health · GET /api/models · POST /api/chat (SSE) · POST /api/feedback
 */
const API_BASE = "https://api.apinex.bond/v1";
const DAILY_LIMIT = 20;
const DEFAULT_MODEL = "GPT 6 Luna";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const MODELS: Record<string, string> = {
  "GPT 6 Luna": "free/gpt-6-luna",
  "GLM-5.3 Flash": "free/glm-5.3-flash",
  "Deepseek V4.1 Flash": "free/deepseek-v4.1-flash",
  "Deepseek V4 Pro": "free/deepseek-v4-pro-0813",
  "Mimo V2.6 Pro": "free/mimo-v2.6-pro",
};

const PROMPTS: Record<string, string> = {
  plan:
    "Kamu adalah generator PRD untuk SvazerPRD. Ubah ide user menjadi PRD untuk AI coding agent. " +
    "Output HANYA dokumen PRD dalam markdown Bahasa Indonesia. " +
    "JANGAN pakai judul dokumen seperti '# PRD: ...' — mulai LANGSUNG dari '## Ringkasan'. " +
    "DILARANG KERAS kalimat pembuka, penutup, konfirmasi, atau narasi proses. " +
    "Jangan tanya balik; buat asumsi dan catat di bagian Asumsi. " +
    "Struktur wajib: Ringkasan, Tujuan, Fitur (P0/P1/P2), User Stories, Data Model, " +
    "Task Terurut (siap dipakai AI coding agent), Acceptance Criteria, Asumsi.",
  design:
    "Kamu adalah desainer UI untuk SvazerPRD. Output HANYA satu code fence ```html berisi prototipe " +
    "lengkap (HTML + CSS di <style>, tanpa build step, responsif, dark theme modern). " +
    "Tanpa kalimat pembuka, penjelasan, atau penutup di luar code fence — mulai langsung dari ```html.",
  svazer:
    "Kamu adalah SvazerAI, asisten coding & produk. Jawab langsung ke inti tanpa bertele-tele, " +
    "tanpa kalimat pembuka seperti 'Baik, saya akan...'. Bahasa Indonesia, kode dalam code fence " +
    "dengan bahasa yang benar.",
  template:
    "Kamu membantu memilih kerangka codebase untuk SvazerPRD. Dari kebutuhan user, output HANYA " +
    "spesifikasi template markdown Bahasa Indonesia, langsung dimulai dengan judul. " +
    "Tanpa kalimat pembuka/penutup. Isi: struktur folder, stack minimal, env vars, " +
    "praktik keamanan wajib, dan checklist go-live.",
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_datetime",
      description: "Dapatkan tanggal dan waktu UTC saat ini, plus waktu Jakarta.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Ambil isi teks sebuah halaman web (URL http/https) sebagai markdown/text, max 8000 char.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "URL lengkap halaman" } },
        required: ["url"],
      },
    },
  },
];

const MAX_TOOL_ROUNDS = 3;

async function runTool(name: string, args: any): Promise<string> {
  if (name === "get_datetime") {
    const now = new Date();
    const jak = new Date(now.getTime() + 7 * 3600e3);
    const iso = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
    return iso(now) + " UTC | Jakarta " + jak.toISOString().slice(11, 16);
  }
  if (name === "web_fetch") {
    const url = String(args?.url ?? "");
    if (!/^https?:\/\//.test(url)) return "error: URL harus http(s)";
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      let text = (await r.text()).slice(0, 200_000);
      const ctype = r.headers.get("content-type") ?? "";
      if (ctype.includes("html")) {
        text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
      }
      return text.replace(/\s+/g, " ").slice(0, 8000);
    } catch (e: any) {
      return "error: " + e.message;
    }
  }
  return "error: tool tidak dikenal";
}

export default async function handler(req: any, res: any) {
  // Plain Node ServerResponse only (res.status()/json() are Next helpers and are
  // absent when this file is deployed as a standalone function).
  const json = (code: number, obj: unknown) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
  };

  try {
    const route = String(req.query?.route ?? "");
    const payload = req.body ?? {};

    if (route === "health") return json(200, { ok: true, key: !!process.env.API_KEY });

    if (route === "models")
      return json(200, {
        models: Object.entries(MODELS).map(([name, id]) => ({ name, id })),
        default: DEFAULT_MODEL,
        limit: DAILY_LIMIT,
      });

    if (route === "feedback" && req.method === "POST") return json(200, { ok: true });

    if (route !== "chat" || req.method !== "POST") return json(404, { error: "not found" });

    const key = process.env.API_KEY;
    if (!key) return json(500, { error: "config", message: "API_KEY belum diisi di Vercel env" });

    const mode = String(payload.mode ?? "svazer");
    const modelId = MODELS[payload.model] ?? payload.model ?? DEFAULT_MODEL;
    const messages: any[] = [{ role: "system", content: PROMPTS[mode] ?? PROMPTS.svazer }];
    messages.push(
      ...(payload.messages ?? [])
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({ role: m.role, content: String(m.content ?? "").slice(0, 8000) }))
        .slice(-12) // ponytail: hard context trim, oldest dropped first
    );
    if (!messages.length || messages[messages.length - 1].role !== "user")
      return json(400, { error: "bad request", message: "pesan kosong" });

    const useTools = !!payload.tools;

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const send = (obj: unknown) => res.write("data: " + JSON.stringify(obj) + "\n\n");

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const body: any = { model: modelId, messages, temperature: 0.7, stream: true };
      if (useTools) body.tools = TOOLS;

      const upstream = await fetch(API_BASE + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key, "User-Agent": UA },
        body: JSON.stringify(body),
      });
      if (!upstream.ok) {
        const detail = (await upstream.text()).slice(0, 300);
        send({ type: "error", message: "Provider error: " + detail });
        break;
      }

      const parts: string[] = [];
      const toolCalls: Record<number, { id: string; name: string; args: string }> = {};
      let finish: string | null = null;

      const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const raw = t.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          let chunk: any;
          try {
            chunk = JSON.parse(raw);
          } catch {
            continue;
          }
          const ch = chunk.choices?.[0];
          if (!ch) continue;
          const delta = ch.delta ?? {};
          if (delta.content) {
            parts.push(delta.content);
            send({ type: "delta", text: delta.content });
          }
          for (const tc of delta.tool_calls ?? []) {
            const idx = tc.index ?? 0;
            const slot = (toolCalls[idx] ??= { id: "", name: "", args: "" });
            if (tc.id) slot.id = tc.id;
            slot.name += tc.function?.name ?? "";
            slot.args += tc.function?.arguments ?? "";
          }
          if (ch.finish_reason) finish = ch.finish_reason;
        }
      }

      if (finish === "length")
        send({
          type: "notice",
          text: "Jawaban terpotong karena mencapai batas panjang. Ketik 'lanjutkan' untuk melanjutkan.",
        });

      const calls = Object.entries(toolCalls);
      if (finish !== "tool_calls" || !calls.length) break;

      messages.push({
        role: "assistant",
        content: parts.join("") || null,
        tool_calls: calls.map(([i, s]) => ({
          id: s.id || "call_" + i,
          type: "function",
          function: { name: s.name, arguments: s.args || "{}" },
        })),
      });
      for (const [i, s] of calls) {
        let result: string;
        try {
          result = await runTool(s.name, JSON.parse(s.args || "{}"));
        } catch (e: any) {
          result = "error: " + e.message;
        }
        send({ type: "tool", name: s.name, args: s.args || "{}", result: result.slice(0, 500) });
        messages.push({ role: "tool", tool_call_id: s.id || "call_" + i, content: result.slice(0, 4000) });
      }
    }
    send({ type: "done" });
    } catch (e: any) {
      try {
        send({ type: "error", message: "Provider unreachable: " + e.message });
      } catch {}
    }
    res.end();
  } catch (e: any) {
    try {
      json(500, { error: "internal", message: String(e?.message ?? e) });
    } catch {}
  }
}

// ponytail: no per-IP quota here — a serverless function has no shared store.
// Add Upstash/Vercel KV if abuse shows up.
export const config = { maxDuration: 300 };
