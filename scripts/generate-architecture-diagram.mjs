import { writeFileSync } from 'node:fs';

// Regenerates assets/architecture-{light,dark}.svg used in README.md.
const out = process.argv[2] ?? new URL('../assets', import.meta.url).pathname;

const themes = {
  light: {
    bg: '#fcfbff', bgStroke: '#e1deec', card: '#ffffff', cardStroke: '#c7c4d6',
    text: '#1b1b24', muted: '#474656', label: '#6e6c7e', arrow: '#8b889c',
    chip: '#eeecf6', chipText: '#312e47', iconBg: '#eeecf6',
    accent: '#4f46e5', accentSoft: '#f3f2ff', accentStroke: '#a5b4fc', accentText: '#3730a3',
    accentChip: '#e2dfff', lane: '#ffffff', green: '#059669', amber: '#d97706',
  },
  dark: {
    bg: '#111118', bgStroke: '#272736', card: '#181822', cardStroke: '#38374a',
    text: '#e6e4f0', muted: '#b8b5c9', label: '#8c89a0', arrow: '#65637a',
    chip: '#272736', chipText: '#d9d7e8', iconBg: '#272736',
    accent: '#6366f1', accentSoft: '#1b1b30', accentStroke: '#4338ca', accentText: '#c4c0ff',
    accentChip: '#2e2a68', lane: '#181822', green: '#34d399', amber: '#fbbf24',
  },
};

const icons = {
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.2A8.5 8.5 0 1 1 21 12z"/>',
  plug: '<path d="M9 2v5M15 2v5M5.5 7h13v4a6.5 6.5 0 0 1-13 0z M12 17.5V22"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  spark: '<path d="M12 3l2 5.5L19.5 10.5 14 12.5 12 18l-2-5.5L4.5 10.5 10 8.5z"/><path d="M19 17v4M17 19h4"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
};

const FONT = `'Roboto Flex', Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const chipW = (s, fs = 12) => Math.round(s.length * fs * 0.58 + 22);

function build(t) {
  const p = [];
  const text = (x, y, s, { size = 14, weight = 400, fill = t.text, anchor = 'start', ls = 0 } = {}) =>
    p.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls ? ` letter-spacing="${ls}"` : ''}>${esc(s)}</text>`);
  const rect = (x, y, w, h, fill, stroke, rx = 18, sw = 1) =>
    p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
  const icon = (name, x, y, { bg = t.iconBg, color = t.text } = {}) => {
    rect(x, y, 38, 38, bg, 'none', 12, 0);
    p.push(`<g transform="translate(${x + 9} ${y + 9}) scale(0.833)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</g>`);
  };
  const chips = (x, y, list, { fill = t.chip, color = t.chipText, gap = 8 } = {}) => {
    let cx = x;
    for (const c of list) {
      const w = chipW(c);
      rect(cx, y, w, 26, fill, 'none', 13, 0);
      text(cx + w / 2, y + 17.5, c, { size: 12, weight: 500, fill: color, anchor: 'middle' });
      cx += w + gap;
    }
    return cx - gap - x;
  };
  const label = (x, y, s) => text(x, y, s, { size: 11.5, weight: 700, fill: t.label, ls: 1.6 });
  const arrow = (x1, y1, x2, y2, accent = false) =>
    p.push(`<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${accent ? t.accent : t.arrow}" stroke-width="${accent ? 2 : 1.6}" fill="none" marker-end="url(#${accent ? 'ha' : 'hn'})"/>`);
  const card = (x, y, w, h, ic, title, sub, { accent = false } = {}) => {
    rect(x, y, w, h, accent ? t.accentSoft : t.card, accent ? t.accentStroke : t.cardStroke, 20, accent ? 1.5 : 1);
    icon(ic, x + 22, y + 22, accent ? { bg: t.accent, color: '#ffffff' } : {});
    text(x + 74, y + 39, title, { size: 18, weight: 700, fill: accent ? t.accentText : t.text });
    text(x + 74, y + 59, sub, { size: 13, fill: t.muted });
  };

  const W = 1200, H = 930;
  p.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="28" fill="${t.bg}" stroke="${t.bgStroke}"/>`);

  // Row 1 — control surfaces
  label(40, 56, 'CONTROL SURFACES · v2.0');
  text(1160, 56, 'Humans, multi-agent teams, and MCP clients drive one workspace', { size: 12.5, fill: t.label, anchor: 'end' });
  card(40, 72, 320, 152, 'person', 'Material 3 Studio', 'Rebuilt expressive UI · Cmd+K');
  chips(60, 174, ['Libraries', 'Workflows', 'Campaigns']);
  card(384, 72, 400, 152, 'chat', 'Multi-Agent Assistant', 'Multi-agents · MCP Apps · any provider', { accent: true });
  chips(404, 174, ['Multi-agents', 'MCP Apps', 'Web Search', 'Skills'], { fill: t.accentChip, color: t.accentText, gap: 6 });
  card(808, 72, 352, 152, 'plug', 'MCP Clients', 'Claude · Codex · any agent', { accent: true });
  chips(830, 174, ['Streamable HTTP', 'MCP Apps', 'OAuth 2.0'], { fill: t.accentChip, color: t.accentText });

  // Row 2 — shared tool layer + MCP Apps
  arrow(584, 224, 584, 296, true);
  arrow(984, 224, 984, 296, true);
  label(384, 278, 'SHARED TOOL LAYER & MCP APPS (ui://)');
  rect(384, 296, 776, 154, t.accentSoft, t.accentStroke, 20, 1.5);
  icon('layers', 406, 318, { bg: t.accent, color: '#ffffff' });
  text(458, 335, 'Account-scoped tools & interactive views', { size: 18, weight: 700, fill: t.accentText });
  text(458, 355, 'Same tools, approvals, and sandboxed MCP App views in-app or over /mcp', { size: 13, fill: t.muted });
  const lanes = [
    { c: t.green, b: 'Read + Views', s: '5 MCP Apps' },
    { c: t.amber, b: 'Write', s: 'preview & confirm' },
    { c: t.accent, b: 'Ownership', s: 'on every call' },
  ];
  const lw = (776 - 44 - 24) / 3;
  lanes.forEach((l, i) => {
    const x = 406 + i * (lw + 12);
    rect(x, 378, lw, 50, t.lane, t.accentStroke, 14, 1);
    p.push(`<circle cx="${x + 20}" cy="403" r="5" fill="${l.c}"/>`);
    p.push(`<text x="${x + 34}" y="408" font-size="13.5" fill="${t.muted}"><tspan font-weight="700" fill="${t.text}">${esc(l.b)}</tspan>  ${esc(l.s)}</text>`);
  });

  // Studio goes straight to the workspace
  arrow(200, 224, 200, 508);
  p.push(`<rect x="136" y="352" width="128" height="24" rx="12" fill="${t.bg}"/>`);
  text(200, 368, 'direct UI', { size: 12, weight: 500, fill: t.label, anchor: 'middle' });
  arrow(772, 450, 772, 508, true);

  // Row 3 — workspace
  label(40, 498, 'LIVE WORKSPACE');
  rect(40, 508, 1120, 104, t.card, t.cardStroke, 20);
  icon('db', 62, 541);
  text(114, 558, 'Durable workspace state', { size: 18, weight: 700 });
  text(114, 578, 'Every surface reads and writes the same live data', { size: 13, fill: t.muted });
  const wsChips = ['Libraries', 'Projects', 'Albums', 'Job Batches', 'Campaigns', 'Posts'];
  const wsW = wsChips.reduce((a, c) => a + chipW(c) + 8, -8);
  chips(1160 - 24 - wsW, 547, wsChips);

  // Row 4 — execution
  arrow(200, 612, 200, 676);
  label(40, 666, 'EXECUTION');
  card(40, 676, 340, 96, 'shuffle', 'Combine / Shuffle', '3 × 4 × 2 → 24 reviewable drafts');
  arrow(380, 724, 408, 724);
  card(410, 676, 340, 96, 'list', 'Recoverable Queues', 'Batches · concurrency · auto-resume');
  arrow(750, 724, 778, 724);
  card(780, 676, 380, 96, 'spark', 'Providers', 'Cloud models · ComfyUI · Civitai');

  // Row 5 — distribution
  arrow(970, 772, 970, 836);
  label(40, 826, 'DISTRIBUTION');
  rect(40, 836, 1120, 60, t.card, t.cardStroke, 20);
  icon('send', 62, 847);
  text(114, 871, 'Results go out', { size: 16, weight: 700 });
  const outChips = ['Albums', 'ZIP exports', 'Cloud drives', 'Storefronts', 'X', 'Threads', 'WebDAV', 'DLNA'];
  const outW = outChips.reduce((a, c) => a + chipW(c) + 8, -8);
  chips(1160 - 24 - outW, 853, outChips);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" role="img" aria-labelledby="title">
<title id="title">Remix Studio 2.0 architecture: Material 3 Studio, the Multi-Agent Assistant, and MCP clients share one account-scoped tool layer and interactive MCP Apps views over a live workspace</title>
<defs>
<marker id="hn" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 z" fill="${t.arrow}"/></marker>
<marker id="ha" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 z" fill="${t.accent}"/></marker>
</defs>
${p.join('\n')}
</svg>
`;
}

for (const [name, t] of Object.entries(themes)) {
  writeFileSync(`${out}/architecture-${name}.svg`, build(t));
}
