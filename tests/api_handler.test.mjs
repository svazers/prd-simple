// Local check for app/api/[route]/route.api.ts (the Vercel backend).
// Uses the Web fetch API shapes the route handler expects.
// Run: node --experimental-strip-types tests/api_handler.test.mjs
import { GET, POST } from "../app/api/[route]/route.api.ts";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
process.env.API_KEY = env
  .split("\n")
  .find((l) => l.startsWith("API_KEY="))
  ?.split("=")
  .slice(1)
  .join("=")
  .trim();

const ctx = (route) => ({ params: Promise.resolve({ route }) });
const post = (route, body) =>
  POST(new Request("http://local/api/" + route, { method: "POST", body: JSON.stringify(body) }), ctx(route));

let fails = 0;
const check = (name, cond, extra = "") => {
  if (!cond) { console.error("FAIL:", name, extra); fails++; }
  else console.log("ok  :", name);
};

// 1) health
let r = await GET(new Request("http://local/api/health"), ctx("health"));
const health = await r.json();
check("health 200 + key true", r.status === 200 && health.key === true, JSON.stringify(health));

// 2) models
r = await GET(new Request("http://local/api/models"), ctx("models"));
const m = await r.json();
check("models has 5", m.models.length === 5, JSON.stringify(m).slice(0, 80));
check("models default", m.default === "GPT 6 Luna");
check("models limit", m.limit === 20);

// 3) unknown route
r = await GET(new Request("http://local/api/nope"), ctx("nope"));
check("unknown -> 404", r.status === 404);

// 4) chat without key -> 500 config
const saved = process.env.API_KEY;
delete process.env.API_KEY;
r = await post("chat", { messages: [{ role: "user", content: "hi" }] });
const noKey = await r.json();
check("chat no key -> 500 config", r.status === 500 && noKey.error === "config", JSON.stringify(noKey));
process.env.API_KEY = saved;

// 5) chat validation -> 400
r = await post("chat", { messages: [{ role: "assistant", content: "x" }] });
check("chat last msg not user -> 400", r.status === 400);

// 6) chat happy path (real provider)
r = await post("chat", {
  mode: "svazer",
  model: "GPT 6 Luna",
  messages: [{ role: "user", content: "Balas persis satu kata: ok" }],
});
check("chat -> 200 SSE", r.status === 200 && String(r.headers.get("content-type")).includes("text/event-stream"));
const body = await r.text();
const frames = body.split("\n\n").filter(Boolean).map((f) => JSON.parse(f.slice(6)));
const kinds = frames.map((f) => f.type);
check("chat has done frame", kinds.includes("done"), kinds.join(","));
const text = frames.filter((f) => f.type === "delta").map((f) => f.text).join("");
const err = frames.find((f) => f.type === "error");
// Either the model streamed text, or the provider refused and we reported it.
check("chat streamed text or explained", text.length > 0 || !!err, kinds.join(","));
if (err) console.log("note: provider said ->", err.message.slice(0, 110));

// 7) feedback
r = await post("feedback", { index: 0, rating: 1 });
check("feedback -> ok", r.status === 200 && (await r.json()).ok === true);

if (fails) { console.error(fails + " failure(s)"); process.exit(1); }
console.log("api handler test ok");
