"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const MODES = [
  { id: "plan", label: "Bikin Plan", short: "Plan", icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
  { id: "design", label: "DesainPakeAI", short: "Desain", icon: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 15l5-5 4 4 3-3 4 4" /></> },
  { id: "svazer", label: "SvazerAI", short: "Svazer", icon: <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" /> },
  { id: "template", label: "Template", short: "Template", icon: <path d="M9 4v16M15 4v16M4 9h16M4 15h16" /> },
];

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="modeicon" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

// suggestions per mode — click to fill input (qwen-style suggestion chips)
const SUGGESTIONS: Record<string, string[]> = {
  plan: [
    "PRD aplikasi kasir UMKM dengan laporan harian",
    "PRD website katalog produk dengan keranjang",
    "PRD aplikasi absensi karyawan berbasis QR",
  ],
  design: [
    "Landing page untuk coffee shop dengan dark theme",
    "Dashboard admin SaaS dengan sidebar",
    "Aplikasi mobile top-up game",
  ],
  svazer: [
    "Bedanya REST dan GraphQL untuk pemula?",
    "Bikin regex validasi nomor telepon Indonesia",
    "Cara optimasi query database yang lambat?",
  ],
  template: [
    "Template API Express + TypeScript production-ready",
    "Kerangka landing page Next.js irit token",
    "Template bot WhatsApp dengan session management",
  ],
};

// ponytail: fence-only markdown renderer; full MD parser if output demands it
function Md({ text }: { text: string }) {
  const segs = text.split("```"); // even = text, odd = code (closing fence splits cleanly)
  const out: React.ReactNode[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (i % 2 === 0) {
      if (segs[i]) out.push(<span key={i} className="mdtext">{fmt(segs[i])}</span>);
    } else {
      let code = segs[i];
      const nl = code.indexOf("\n");
      const first = (nl === -1 ? code : code.slice(0, nl)).trim();
      if (/^[a-zA-Z0-9+#_-]{0,15}$/.test(first)) code = nl === -1 ? "" : code.slice(nl + 1);
      out.push(<pre key={i}><code>{code.replace(/\n$/, "")}</code></pre>);
    }
  }
  return <>{out}</>;
}

// inline **bold** only
function bold(s: string): React.ReactNode {
  const parts = s.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));
}

// line-level: headings, bullets, bold — enough for PRD-style output
function fmt(text: string): React.ReactNode[] {
  return text.split("\n").map((line, i) => {
    if (/^###\s+/.test(line)) return <h4 key={i}>{bold(line.slice(4))}</h4>;
    if (/^##\s+/.test(line)) return <h3 key={i}>{bold(line.slice(3))}</h3>;
    if (/^#\s+/.test(line)) return <h2 key={i}>{bold(line.slice(2))}</h2>;
    if (/^[-*]\s+/.test(line)) return <div key={i} className="mdli">{bold(line.slice(2))}</div>;
    return <span key={i}>{bold(line)}{"\n"}</span>;
  });
}

// action bar under AI bubbles: pin, copy, speak, like, dislike, regenerate
function MsgActions({
  text, pinned, onPin, onCopy, onRate, rated, onRegen,
}: {
  text: string;
  pinned: boolean;
  onPin: () => void;
  onCopy: () => void;
  onRate: (v: 1 | -1) => void;
  rated?: 1 | -1;
  onRegen?: () => void;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);

  function speak() {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text.slice(0, 3000));
    u.lang = "id-ID";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setSpeaking(true);
  }

  return (
    <div className="msgactions">
      <button className={pinned ? "act on" : "act"} title="Pin" aria-label="Pin" onClick={onPin}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 3h6l1 7 3 3H5l3-3z" /></svg>
      </button>
      <button className="act" title="Salin" aria-label="Salin" onClick={() => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <span className="copiedok">✓</span> : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
        )}
      </button>
      <button className={speaking ? "act on" : "act"} title="Bacakan" aria-label="Bacakan" onClick={speak}>
        {speaking ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M22 9l-6 6M16 9l6 6" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>
        )}
      </button>
      <button className={rated === 1 ? "act on" : "act"} title="Bagus" aria-label="Bagus" onClick={() => onRate(1)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={rated === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm0 0l4-7a2.4 2.4 0 0 1 2.4 2.4V9H19a2 2 0 0 1 2 2.4l-1.2 7A2 2 0 0 1 18 20H7" /></svg>
      </button>
      <button className={rated === -1 ? "act on" : "act"} title="Kurang" aria-label="Kurang" onClick={() => onRate(-1)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={rated === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(180deg)" }}><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm0 0l4-7a2.4 2.4 0 0 1 2.4 2.4V9H19a2 2 0 0 1 2 2.4l-1.2 7A2 2 0 0 1 18 20H7" /></svg>
      </button>
      {onRegen && (
        <button className="act" title="Regenerate" aria-label="Regenerate" onClick={onRegen}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>
        </button>
      )}
    </div>
  );
}

export default function Chat() {
  const [ready, setReady] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [mode, setMode] = useState("svazer");
  const [limit, setLimit] = useState(20);
  const [used, setUsed] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [toolsOn, setToolsOn] = useState(true);
  const [msgs, setMsgs] = useState<{ role: string; content: string; tool?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modesRef = useRef<HTMLDivElement>(null);
  const activeModeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // keep the active tab visible in the scrollable mobile strip
    activeModeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [mode]);

  useEffect(() => {
    const m = new URLSearchParams(location.search).get("mode");
    if (m) setMode(m);
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models.map((m: { name: string }) => m.name));
        setModel(d.default);
        setLimit(d.limit);
        setReady(true);
      })
      .catch(() => setReady(true));
    try {
      setMsgs(JSON.parse(localStorage.getItem("svazer_chat") || "[]"));
    } catch {}
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    localStorage.setItem("svazer_chat", JSON.stringify(msgs.slice(-40)));
  }, [msgs]);

  function stop() {
    abortRef.current?.abort();
  }

  // --- message actions state ---
  const [pinned, setPinned] = useState<number[]>([]);
  const [ratings, setRatings] = useState<Record<number, 1 | -1>>({});
  const lastAiIndex = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant" && msgs[i].content) return i;
    }
    return -1;
  })();

  function togglePin(i: number) {
    setPinned((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  }

  function copyText(t: string) {
    navigator.clipboard.writeText(t).catch(() => {});
  }

  function rate(i: number, v: 1 | -1) {
    setRatings((r) => {
      const next = { ...r };
      if (next[i] === v) delete next[i];
      else next[i] = v;
      return next;
    });
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: i, rating: v, model }),
    }).catch(() => {});
  }

  async function regen() {
    if (busy) return;
    const upto = lastAiIndex;
    if (upto < 1) return;
    const prev = msgs.slice(0, upto); // drop the last AI answer, resend its prompt
    setMsgs(prev);
    const lastUser = [...prev].reverse().find((m) => m.role === "user");
    if (lastUser) {
      setInput(lastUser.content);
      // send() reads input state; simpler: re-run request inline
      const ac = new AbortController();
      abortRef.current = ac;
      setBusy(true);
      let acc = "";
      try {
        const r = await fetch("/api/chat", {
          method: "POST",
          signal: ac.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, model, tools: toolsOn, messages: prev.filter((m) => m.role !== "tool") }),
        });
        if (r.ok && r.body) {
          setUsed((u) => (u ?? 0) + 1);
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const frames = buf.split("\n\n");
            buf = frames.pop() || "";
            for (const f of frames) {
              if (!f.startsWith("data:")) continue;
              let ev: any;
              try { ev = JSON.parse(f.slice(5)); } catch { continue; }
              if (ev.type === "delta") {
                acc += ev.text;
                setMsgs([...prev, { role: "assistant", content: acc }]);
              } else if (ev.type === "notice") {
                acc += (acc ? "\n\n" : "") + "ℹ️ " + ev.text;
                setMsgs([...prev, { role: "assistant", content: acc }]);
              } else if (ev.type === "error") {
                acc += (acc ? "\n\n" : "") + "⚠️ " + ev.message;
                setMsgs([...prev, { role: "assistant", content: acc }]);
              }
            }
          }
          if (!acc) setMsgs([...prev, { role: "assistant", content: "⚠️ Respons kosong dari model." }]);
        }
      } catch {} finally {
        setBusy(false);
        abortRef.current = null;
      }
    }
  }

  function newChat() {
    stop();
    setMsgs([]);
    setInput("");
    localStorage.removeItem("svazer_chat");
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user", content: text }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        signal: ac.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, model, tools: toolsOn, messages: next }),
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({ message: "Gagal memproses." }));
        setMsgs([...next, { role: "assistant", content: "⚠️ " + (d.message || "Gagal memproses.") }]);
        return;
      }
      setUsed((u) => (u ?? 0) + 1);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() || "";
        for (const f of frames) {
          if (!f.startsWith("data:")) continue;
          let ev: any;
          try { ev = JSON.parse(f.slice(5)); } catch { continue; }
          if (ev.type === "delta") {
            acc += ev.text;
            setMsgs([...next, { role: "assistant", content: acc }]);
          } else if (ev.type === "tool") {
            const note = `🔧 ${ev.name}(${ev.args.slice(0, 80)})`;
            setMsgs((cur) => {
              const withoutPlaceholder = cur.filter((m) => m.role !== "assistant" || m.content !== "");
              const label: { role: string; content: string; tool?: string } = { role: "tool", content: note, tool: ev.result.slice(0, 200) };
              const last = withoutPlaceholder[withoutPlaceholder.length - 1];
              if (last?.role === "assistant") {
                return [...withoutPlaceholder.slice(0, -1), label, last];
              }
              return [...withoutPlaceholder, label];
            });
          } else if (ev.type === "notice") {
            acc += (acc ? "\n\n" : "") + "ℹ️ " + ev.text;
            setMsgs([...next, { role: "assistant", content: acc }]);
          } else if (ev.type === "error") {
            acc += (acc ? "\n\n" : "") + "⚠️ " + ev.message;
            setMsgs([...next, { role: "assistant", content: acc }]);
          }
        }
      }
      if (!acc) setMsgs([...next, { role: "assistant", content: "⚠️ Respons kosong dari model." }]);
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setMsgs([...next, { role: "assistant", content: acc ? acc + "\n\n*(dihentikan)*" : "*(dihentikan)*" }]);
      } else {
        setMsgs([...next, { role: "assistant", content: acc + (acc ? "\n\n" : "") + "⚠️ Koneksi gagal." }]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function download(md: string) {
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "svazerprd-output.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const empty = msgs.length === 0;
  const last = [...msgs].reverse().find((m) => m.role === "assistant" && m.content);

  return (
    <div className="shell">
      {/* sidebar ala chat.qwen.ai */}
      <aside className="sidebar" id="sidebar">
        <div className="sidehead">
          <Link className="brand" href="/"><span className="branddot" /> svazerprd</Link>
          <button className="iconbtn" onClick={newChat} title="Chat baru" aria-label="Chat baru">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <div className="modes" ref={modesRef}>
          {MODES.map((m) => (
            <button
              key={m.id}
              ref={mode === m.id ? activeModeRef : undefined}
              className={`modeitem${mode === m.id ? " active" : ""}`}
              onClick={() => setMode(m.id)}
            >
              <Icon>{m.icon}</Icon> <span className="mlong">{m.label}</span><span className="mshort">{m.short}</span>
            </button>
          ))}
        </div>
        <div className="sidefoot">
          <label className="toolstoggle" title="Biarkan model pakai tool: jam & baca halaman web">
            <input type="checkbox" checked={toolsOn} onChange={(e) => setToolsOn(e.target.checked)} />
            Tools
          </label>
          {used !== null && (
            <span className="quota" title={`Reset 07:00 WIB · limit ${limit}/hari`}>
              {limit - used} sisa hari ini
            </span>
          )}
        </div>
      </aside>

      <main className="chatcol">
        <div className="chatlog" ref={logRef}>
          {empty ? (
            <div className="welcome">
              <h1>Halo, mau bikin apa hari ini?</h1>
              <div className="modesug">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`sugmode${mode === m.id ? " active" : ""}`}
                    onClick={() => setMode(m.id)}
                  >
                    <Icon>{m.icon}</Icon> {m.label}
                  </button>
                ))}
              </div>
              <div className="suggrid">
                {SUGGESTIONS[mode]?.map((s) => (
                  <button key={s} className="sug" onClick={() => { setInput(s); }}>
                    <svg className="sugicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
                    </svg>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            msgs.map((m, i) =>
              m.role === "tool" ? (
                <details key={i} className="toolev">
                  <summary>{m.content}</summary>
                  <div className="toolresult">{m.tool}</div>
                </details>
              ) : (
                <div key={i} className={`msg ${m.role}`}>
                  <div className="bubble">
                    {m.role === "assistant" ? <Md text={m.content} /> : m.content}
                  </div>
                  {m.role === "assistant" && m.content && !busy && (
                    <MsgActions
                      text={m.content}
                      pinned={pinned.includes(i)}
                      onPin={() => togglePin(i)}
                      onCopy={() => copyText(m.content)}
                      onRate={(v) => rate(i, v)}
                      rated={ratings[i]}
                      onRegen={lastAiIndex === i ? regen : undefined}
                    />
                  )}
                </div>
              )
            )
          )}
          {busy && <div className="msg assistant"><div className="bubble typing">▍</div></div>}
        </div>

        <div className="composer">
          <div className="composerbox">
            <textarea
              value={input}
              rows={1}
              placeholder={`Tanya ${MODES.find((m) => m.id === mode)?.label}…`}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="composerrow">
              <select
                aria-label="Model"
                className="compmodel"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                {!ready && <option>…</option>}
              </select>
              <div className="comporight">
                {busy ? (
                  <button className="btn btn-ghost stopbtn" onClick={stop}>■ Stop</button>
                ) : (
                  <button className="sendbtn" onClick={send} disabled={!input.trim() || !ready} aria-label="Kirim">↑</button>
                )}
              </div>
            </div>
          </div>
          <p className="compnote">
            {used !== null ? `${limit - used} dari ${limit} request gratis tersisa · reset 07:00 WIB` : "Kuota gratis harian · reset 07:00 WIB"}
            {last && (
              <>
                {" · "}
                <button className="linkbtn" onClick={() => download(last.content)}>Unduh jawaban .md</button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
