// Tiny Markdown reader for AI chat replies: headings, bullet / numbered lists (with nesting), rules,
// paragraphs, plus **bold**, *italic* and `code` inside text. It only builds plain data — the React
// side renders text nodes, so nothing the model writes can ever become HTML.

export interface ListItem {
  text: string;
  ordered: boolean;
  children: ListItem[];
}

export type Block =
  | { type: "hr" }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "para"; lines: string[] };

export type Inline = { kind: "text" | "bold" | "italic" | "code"; text: string };

const LIST_RE = /^(\s*)([*\-•]|\d+[.)])\s+(.*)$/;
const HR_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

const isSpecial = (line: string) => HR_RE.test(line) || HEADING_RE.test(line) || LIST_RE.test(line);

function buildList(flat: { indent: number; ordered: boolean; text: string }[]): Block {
  const root: ListItem[] = [];
  const stack: { indent: number; children: ListItem[] }[] = [{ indent: -1, children: root }];
  for (const it of flat) {
    while (stack.length > 1 && it.indent <= stack[stack.length - 1].indent) stack.pop();
    const node: ListItem = { text: it.text, ordered: it.ordered, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push({ indent: it.indent, children: node.children });
  }
  return { type: "list", ordered: flat[0].ordered, items: root };
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: h[2].trim() });
      i++;
      continue;
    }
    if (LIST_RE.test(line)) {
      const flat: { indent: number; ordered: boolean; text: string }[] = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const m = LIST_RE.exec(lines[i]) as RegExpExecArray;
        const item = { indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] };
        // A top-level item of the other kind (bullets -> numbers) starts a new list.
        if (flat.length > 0 && item.indent <= flat[0].indent && item.ordered !== flat[0].ordered) break;
        flat.push(item);
        i++;
        // models often put a blank line between items — keep it one list
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j > i && j < lines.length && LIST_RE.test(lines[j])) i = j;
      }
      blocks.push(buildList(flat));
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: "para", lines: para });
  }
  return blocks;
}

// **bold**, `code`, *italic* (the opening * must touch a non-space, so "2 * 3" stays as text)
const INLINE_RE = /(\*\*[^*\n]+?\*\*|`[^`\n]+`|\*[^*\s][^*\n]*?\*)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: "text", text: text.slice(last, idx) });
    const tok = m[0];
    if (tok.startsWith("**")) out.push({ kind: "bold", text: tok.slice(2, -2) });
    else if (tok.startsWith("`")) out.push({ kind: "code", text: tok.slice(1, -1) });
    else out.push({ kind: "italic", text: tok.slice(1, -1) });
    last = idx + tok.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
