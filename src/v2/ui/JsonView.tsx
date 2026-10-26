import type { ReactNode } from 'react';

const TOKEN = /"(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/g;

function tokenKind(match: string) {
  if (match.startsWith('"')) return match.endsWith(':') ? 'key' : 'string';
  if (match === 'true' || match === 'false') return 'boolean';
  if (match === 'null') return 'null';
  return 'number';
}

function highlight(json: string) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of json.matchAll(TOKEN)) {
    const offset = m.index ?? 0;
    if (offset > last) out.push(json.slice(last, offset));
    out.push(
      <span key={offset} className="v2-json__token" data-kind={tokenKind(m[0])}>
        {m[0]}
      </span>,
    );
    last = offset + m[0].length;
  }
  out.push(json.slice(last));
  return out;
}

/** Pretty-printed, syntax-coloured JSON; a string is shown as given. */
export function JsonView({ data, className }: { data: unknown; className?: string }) {
  if (data === null || data === undefined) return null;
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return <pre className={['v2-json', className].filter(Boolean).join(' ')}>{highlight(text)}</pre>;
}
