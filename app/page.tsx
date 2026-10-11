"use client";

import Link from "next/link";

// spotlight follows the cursor — Qwen's signature card effect
function spot(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
  el.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
}

const modes = [
  {
    tag: "Plan",
    title: "Bikin Plan",
    desc: "Dari ide jadi PRD, spec fitur dan task terurut yang siap dipake AI coding agent.",
    href: "/chat?mode=plan",
    cta: "Mulai Sekarang",
    lead: true,
  },
  {
    tag: "Desain",
    title: "DesainPakeAI",
    desc: "Rancang tampilan website dan aplikasi bareng AI, dari ide sampai prototipe HTML yang langsung jalan.",
    href: "/chat?mode=design",
    cta: "Mulai Sekarang",
  },
  {
    tag: "Chat",
    title: "SvazerAI",
    desc: "Ngechat dan bikin PRD dengan Gpt 6 Luna, GLM-5.3 Flash, Deepseek V4.1 Flash, dan model lainnya.",
    href: "/chat?mode=svazer",
    cta: "Mulai Sekarang",
  },
  {
    tag: "Codebase",
    title: "Template",
    desc: "Gunakan kerangka codebase untuk bikin aplikasi irit token, lebih aman, siap untuk production.",
    href: "/chat?mode=template",
    cta: "Mulai Sekarang",
    lead: true,
  },
];

const models = [
  { name: "GPT 6 Luna", spec: "Free · 1M context", desc: "Model andalan gratis — cepat dan pintar untuk PRD, desain, dan coding harian." },
  { name: "GLM-5.3 Flash", spec: "Free · 1M context", desc: "Ringan dan responsif, pas untuk iterasi cepat dan tanya jawab teknis." },
  { name: "Deepseek V4.1 Flash", spec: "Free · 1M context", desc: "Kuat di reasoning dan kode, gratis tanpa login." },
  { name: "Deepseek V4 Pro", spec: "Free · 1M context", desc: "Versi Pro Deepseek — lebih dalam untuk tugas kompleks dan refactor." },
  { name: "Mimo V2.6 Pro", spec: "Free · 1M context", desc: "Model Pro tambahan — alternatif solid untuk coding dan analisis." },
];

export default function Home() {
  return (
    <>
      <nav className="nav">
        <div className="wrap navrow">
          <a className="brand" href="/">
            <span className="branddot" /> svazerprd
          </a>
          <div className="navlinks">
            <a href="#fitur">Fitur</a>
            <a href="#model">Model</a>
            <a href="/chat">Chat AI</a>
          </div>
          <a className="btn btn-pill navcta" href="/chat?mode=plan">Coba Gratis</a>
          <details className="navmenu">
            <summary aria-label="Menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </summary>
            <div className="menulist">
              <a href="#fitur">Fitur</a>
              <a href="#model">Model</a>
              <a href="/chat">Chat AI</a>
            </div>
          </details>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="wrap">
            <a className="chip" href="/chat">GRATIS · Tanpa Login · Reset kuota 07:00 WIB</a>
            <h1>
              Dari ide jadi produk,<br />dibantu AI.
            </h1>
            <p className="sub">
              Ask SvazerPRD, Know More — pilih modenya, tulis idenya,
              langsung dapat PRD, prototipe, atau kerangka aplikasi.
            </p>
            <div className="moderow">
              <a className="modechip" href="/chat?mode=plan">Bikin Plan</a>
              <a className="modechip" href="/chat?mode=design">DesainPakeAI</a>
              <a className="modechip" href="/chat?mode=svazer">SvazerAI</a>
              <a className="modechip" href="/chat?mode=template">Template</a>
            </div>
          </div>
        </section>

        <section className="features" id="fitur">
          <div className="wrap">
            <h2>Produk</h2>
            <div className="grid">
              {modes.map((m) => (
                <article key={m.title} className={`card${m.lead ? " lead" : ""}`} onMouseMove={spot}>
                  <span className="tag">{m.tag}</span>
                  <h3>{m.title}</h3>
                  <p>{m.desc}</p>
                  <a className="go" href={m.href}>{m.cta} →</a>
                </article>
              ))}
              <article className="card lead" onMouseMove={spot}>
                <div>
                  <span className="tag">Gratis</span>
                  <h3>4 mode, satu chat</h3>
                  <p>
                    Semua mode jalan di satu halaman chat: ganti mode, ganti model,
                    tools bawaan (jam & baca halaman web), streaming jawaban, dan unduh
                    hasil sebagai markdown.
                  </p>
                </div>
                <a className="btn btn-pill" href="/chat">Buka Chat →</a>
              </article>
            </div>
          </div>
        </section>

        <section className="features" id="model">
          <div className="wrap">
            <div className="sechead">
              <h2>Model Gratis</h2>
              <span className="tag">Dipakai ulang tiap hari · Reset 07:00 WIB</span>
            </div>
            <div className="grid grid3">
              {models.map((m) => (
                <article key={m.name} className="card slim" onMouseMove={spot}>
                  <h3>{m.name}</h3>
                  <span className="modelspec">{m.spec}</span>
                  <p>{m.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="cta-final">
          <div className="wrap">
            <h2>Coba SvazerPRD</h2>
            <p className="sub">Gratis, tanpa login. Kuota harian, reset otomatis tiap jam 7 pagi WIB.</p>
            <div className="moderow center">
              <a className="btn btn-pill big" href="/chat?mode=plan">Mulai Sekarang</a>
              <a className="btn btn-ghost big" href="/chat">Chat AI</a>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap footrow">
          <div className="footcol">
            <span className="brand"><span className="branddot" /> svazerprd</span>
            <p>Dari ide jadi produk, dibantu AI. Gratis untuk semua.</p>
          </div>
          <div className="footcol">
            <strong>Produk</strong>
            <a href="/chat?mode=plan">Bikin Plan</a>
            <a href="/chat?mode=design">DesainPakeAI</a>
            <a href="/chat?mode=svazer">SvazerAI</a>
            <a href="/chat?mode=template">Template</a>
          </div>
          <div className="footcol">
            <strong>Sumber</strong>
            <a href="#model">Model</a>
            <a href="/api/models">API Status</a>
          </div>
        </div>
        <div className="wrap footlegal">
          <span>© {new Date().getFullYear()} SvazerPRD</span>
          <span>Powered by open models</span>
        </div>
      </footer>
    </>
  );
}
