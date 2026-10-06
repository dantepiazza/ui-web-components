// Minimal, dependency-free Markdown → HTML. Covers what READMEs and notes actually use:
// headings, paragraphs, bold/italic/strike, inline + fenced code, links, images,
// blockquotes, nested ordered/unordered lists, task lists, tables, rules.
//
// Safety: ALL source text is HTML-escaped first, so raw HTML in the .md is shown as text,
// never executed; link/image URLs are limited to http(s), mailto and relative paths.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// `u` is already escaped. Allow relative URLs and http/https/mailto only.
const safeUrl = (u) => (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^(https?|mailto):/i.test(u) ? '#' : u);

function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, u) => `<img src="${safeUrl(u)}" alt="${alt}">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, t, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  s = s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`);
  s = s.replace(/\*(?!\s)(.+?)(?<!\s)\*|(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])/g, (_, a, b) => `<em>${a ?? b}</em>`);
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/ {2,}$/, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const isBlockStart = (l) => /^(#{1,6}\s|```|>|\s*([-*_])(\s*\2){2,}\s*$)/.test(l) || LIST.test(l);

function renderList(lines) {
  const items = lines.map((l) => {
    const m = LIST.exec(l);
    return { indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), text: m[3] };
  });
  let i = 0;
  const build = (indent) => {
    const ordered = items[i].ordered;
    let out = ordered ? '<ol>' : '<ul>';
    while (i < items.length && items[i].indent >= indent) {
      if (items[i].indent > indent) {
        out += build(items[i].indent);
        continue;
      }
      const task = /^\[([ xX])\]\s+(.*)$/.exec(items[i].text);
      const body = task
        ? `<input type="checkbox" disabled ${task[1] !== ' ' ? 'checked' : ''} class="mr-1.5">${inline(task[2])}`
        : inline(items[i].text);
      i++;
      let nested = '';
      if (i < items.length && items[i].indent > indent) nested = build(items[i].indent);
      out += `<li${task ? ' class="list-none -ml-6"' : ''}>${body}${nested}</li>`;
    }
    return out + (ordered ? '</ol>' : '</ul>');
  };
  return build(items[0].indent);
}

const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function renderMarkdown(source) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = /^```\s*(\S*)/.exec(line);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table>'
      );
      continue;
    }

    if (LIST.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim() && LIST.test(lines[i])) buf.push(lines[i++]);
      out.push(renderList(buf));
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && (!para.length || !isBlockStart(lines[i]))) para.push(lines[i++]);
    out.push(`<p>${para.map((l) => inline(l.replace(/\s+$/, (m) => (m.length >= 2 ? '  ' : '')))).join(' ')}</p>`);
  }
  return out.join('\n');
}
