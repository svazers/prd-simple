// Minimal probe function: included only to verify the Vercel Node runtime works
// for this project at all.
export default function handler(req: any, res: any) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: true, probe: "ping", node: process.version }));
}
