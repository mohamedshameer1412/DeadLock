// A small, safe Markdown renderer for notes: headings, paragraphs, lists, quotes, code, bold, italic. Builds React elements only,
// never HTML, so nothing a note contains can run as script.
function inline(text, keyBase) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0, i = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-surface-2 px-1 text-[0.9em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const [, label, href] = t.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
      out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer">{label}</a>);
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { blocks.push({ t: "h", level: h[1].length, text: h[2] }); i++; continue; }
    if (line.startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push({ t: "code", text: code.join("\n") });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) { const items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, "")); blocks.push({ t: "ul", items }); continue; }
    if (/^\s*\d+[.)]\s+/.test(line)) { const items = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, "")); blocks.push({ t: "ol", items }); continue; }
    if (/^\s*(\[\d+\]\s*)?>/.test(line)) { const q = []; while (i < lines.length && /^\s*(\[\d+\]\s*)?>/.test(lines[i])) q.push(lines[i++].replace(/^\s*(\[\d+\]\s*)?>\s?/, "")); blocks.push({ t: "quote", text: q.join(" ") }); continue; }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+[.)]\s|\s*>)/.test(lines[i])) p.push(lines[i++]);
    blocks.push({ t: "p", text: p.join(" ") });
  }
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((b, n) => {
        const k = `b${n}`;
        if (b.t === "h") { const Tag = `h${Math.min(6, b.level + 2)}`; return <Tag key={k} className={b.level <= 2 ? "break-anywhere text-lg font-bold" : "break-anywhere text-base font-bold"}>{inline(b.text, k)}</Tag>; }
        if (b.t === "ul") return <ul key={k} className="list-disc space-y-1 pl-6">{b.items.map((x, j) => <li key={j} className="break-anywhere">{inline(x, `${k}-${j}`)}</li>)}</ul>;
        if (b.t === "ol") return <ol key={k} className="list-decimal space-y-1 pl-6">{b.items.map((x, j) => <li key={j} className="break-anywhere">{inline(x, `${k}-${j}`)}</li>)}</ol>;
        if (b.t === "quote") return <blockquote key={k} className="break-anywhere border-l-4 border-primary pl-3 text-muted">{inline(b.text, k)}</blockquote>;
        if (b.t === "code") return <pre key={k} className="overflow-x-auto rounded-md bg-surface-2 p-3 text-xs">{b.text}</pre>;
        return <p key={k} className="break-anywhere">{inline(b.text, k)}</p>;
      })}
    </div>
  );
}
