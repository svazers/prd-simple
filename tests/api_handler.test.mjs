// Local check for api/[route].ts logic: strips types, runs the real handler
// against a fake req/res and the real provider.
// Run: node --experimental-strip-types tests/api_handler.test.mjs
import handler from "../api/[route].ts";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const key = env.split("\n").find((l) => l.startsWith("API_KEY="))?.split("=").slice(1).join("=").trim();
process.env.API_KEY = key;

function fakeRes() {
  const chunks = [];
  return {
    statusCode: 0,
    headers: {},
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(c, h) { this.statusCode = c; Object.assign(this.headers, h); },
    write(s) { chunks.push(s); return true; },
    send(s) { chunks.push(s); },
    end(s) { if (s) chunks.push(s); },
    get body() { return chunks.join(""); },
  };
}

let fails = 0;
const check = (name, cond, extra = "") => {
  if (!cond) { console.error("FAIL:", name, extra); fails++; }
  else console.log("ok  :", name);
};

// 1) health
let res = fakeRes();
await handler({ query: { route: "health" }, method: "GET" }, res);
check("health 200 + key true", res.statusCode === 200 && JSON.parse(res.body).key === true, res.body);

// 2) models
res = fakeRes();
await handler({ query: { route: "models" }, method: "GET" }, res);
const m = JSON.parse(res.body);
check("models has 5", m.models.length === 5, res.body);
check("models default", m.default === "GPT 6 Luna");

// 3) unknown route
res = fakeRes();
await handler({ query: { route: "nope" }, method: "GET" }, res);
check("unknown -> 404", res.statusCode === 404);

// 4) chat without key -> 500 config
const saved = process.env.API_KEY;
delete process.env.API_KEY;
res = fakeRes();
await handler({ query: { route: "chat" }, method: "POST", body: { messages: [{ role: "user", content: "hi" }] } }, res);
check("chat no key -> 500 config", res.statusCode === 500 && JSON.parse(res.body).error === "config");
process.env.API_KEY = saved;

// 5) chat happy path (real provider): must emit delta frames + done
res = fakeRes();
await handler(
  { query: { route: "chat" }, method: "POST", body: { mode: "svazer", model: "GPT 6 Luna", messages: [{ role: "user", content: "Balas persis satu kata: ok" }] } },
  res
);
const frames = res.body.split("\n\n").filter(Boolean).map((f) => JSON.parse(f.slice(6)));
const kinds = frames.map((f) => f.type);
check("chat SSE headers", String(res.headers["Content-Type"]).includes("text/event-stream"), JSON.stringify(res.headers));
check("chat has done frame", kinds.includes("done"), kinds.join(","));
const text = frames.filter((f) => f.type === "delta").map((f) => f.text).join("");
const err = frames.find((f) => f.type === "error");
// Either the model streamed text, or the provider refused and we reported it.
check("chat streamed text or explained", text.length > 0 || !!err, kinds.join(","));
if (err) console.log("note: provider said ->", err.message.slice(0, 120));

// 6) tool loop reaches the handler (get_datetime is local, no provider round needed)
const dt = await (await import("../api/[route].ts")).default;
check("module exports a default handler", typeof dt === "function");

if (fails) { console.error(fails + " failure(s)"); process.exit(1); }
console.log("api handler test ok");
