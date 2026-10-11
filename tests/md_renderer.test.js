// Self-check for the Md fence-splitting logic (mirrors app/chat/page.tsx).
// Run: node tests/md_renderer.test.js
function segsOf(text) {
  return text.split("```");
}
function stripLang(code) {
  const nl = code.indexOf("\n");
  const first = (nl === -1 ? code : code.slice(0, nl)).trim();
  if (/^[a-zA-Z0-9+#_-]{0,15}$/.test(first)) code = nl === -1 ? "" : code.slice(nl + 1);
  return code.replace(/\n$/, "");
}

let fails = 0;
function check(name, cond) {
  if (!cond) { console.error("FAIL:", name); fails++; }
}

// 1) one fence block with lang + closing fence: no duplication
let md = "Sebelum\n```text\nsvazer/\n  app/\n  page.tsx\n```\nSesudah";
let s = segsOf(md);
check("3 segments", s.length === 3);
check("text before", s[0].trim() === "Sebelum");
check("lang stripped", stripLang(s[1]) === "svazer/\n  app/\n  page.tsx");
check("text after", s[2].trim() === "Sesudah");

// 2) no fences at all -> single text segment
s = segsOf("plain **text** only");
check("no fence = 1 seg", s.length === 1 && s[0].includes("plain"));

// 3) unclosed fence (streaming state): lang stripped, code kept
s = segsOf("intro\n```tsx\ncode here");
check("unclosed = 2 segs", s.length === 2);
check("unclosed code", stripLang(s[1]) === "code here");

// 4) fence without language
s = segsOf("```\njust code\n```");
check("no-lang code", stripLang(s[1]) === "just code");

// 5) two separate blocks
s = segsOf("```js\na()\n``` mid ```py\nb()\n```");
check("two blocks = 5 segs", s.length === 5);
check("block1", stripLang(s[1]) === "a()");
check("block2", stripLang(s[3]) === "b()");

// 6) content line that LOOKS like a lang token is preserved (only first line consumed)
s = segsOf("```text\nbuild\n```");
check("code body intact", stripLang(s[1]) === "build");

if (fails) { console.error(fails + " failure(s)"); process.exit(1); }
console.log("md renderer test ok");
