/**
 * The small amount of formatting people actually use when they write up a delivery.
 *
 * Board posts and shared commands need bullets, inline code and the occasional link. Full
 * Markdown would mean a dependency and an HTML sanitiser, and the moment untrusted text
 * becomes HTML somebody has to be sure about it forever. So this parses to a structure and
 * the renderer turns that into React elements — there is no HTML string anywhere, which
 * means there is no injection to get wrong. Anything unsupported stays as literal text.
 */

export interface Span {
  kind: 'text' | 'code' | 'strong' | 'link';
  text: string;
  href?: string;
}

export type Block =
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'bullets'; items: Span[][] }
  | { kind: 'numbers'; items: Span[][] }
  | { kind: 'quote'; spans: Span[] }
  | { kind: 'code'; text: string; language?: string };

/** Only schemes a link can safely be. Anything else renders as plain text. */
function safeHref(url: string): string | undefined {
  const trimmed = url.trim();
  return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : undefined;
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+)/g;

export function parseInline(input: string): Span[] {
  const spans: Span[] = [];
  let cursor = 0;

  for (const match of input.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      spans.push({ kind: 'text', text: input.slice(cursor, index) });
    }
    const token = match[0];

    if (token.startsWith('`')) {
      spans.push({ kind: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('**')) {
      spans.push({ kind: 'strong', text: token.slice(2, -2) });
    } else if (token.startsWith('[')) {
      const parts = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const href = parts ? safeHref(parts[2]!) : undefined;
      if (parts && href) {
        spans.push({ kind: 'link', text: parts[1]!, href });
      } else {
        spans.push({ kind: 'text', text: token });
      }
    } else {
      // A bare URL often ends a sentence, and the full stop is not part of it.
      const trailing = token.match(/[.,;:!?]+$/)?.[0] ?? '';
      const url = trailing ? token.slice(0, -trailing.length) : token;
      const href = safeHref(url);
      if (href) spans.push({ kind: 'link', text: url, href });
      else spans.push({ kind: 'text', text: url });
      if (trailing) spans.push({ kind: 'text', text: trailing });
    }

    cursor = index + token.length;
  }

  if (cursor < input.length) {
    spans.push({ kind: 'text', text: input.slice(cursor) });
  }
  return spans.length > 0 ? spans : [{ kind: 'text', text: input }];
}

const BULLET = /^\s*[-*\u2022]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```\s*([a-zA-Z0-9+#-]*)\s*$/;

export function parseRichText(input: string): Block[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];
  let quote: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', spans: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
    if (bullets.length > 0) {
      blocks.push({ kind: 'bullets', items: bullets.map(parseInline) });
      bullets = [];
    }
    if (numbers.length > 0) {
      blocks.push({ kind: 'numbers', items: numbers.map(parseInline) });
      numbers = [];
    }
    if (quote.length > 0) {
      blocks.push({ kind: 'quote', spans: parseInline(quote.join(' ')) });
      quote = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const fence = line.match(FENCE);

    if (fence) {
      flush();
      const language = fence[1] || undefined;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index]!)) {
        body.push(lines[index]!);
        index += 1;
      }
      blocks.push({ kind: 'code', text: body.join('\n'), language });
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    const bullet = line.match(BULLET);
    if (bullet) {
      if (paragraph.length > 0 || numbers.length > 0 || quote.length > 0) flush();
      bullets.push(bullet[1]!);
      continue;
    }

    const numbered = line.match(NUMBERED);
    if (numbered) {
      if (paragraph.length > 0 || bullets.length > 0 || quote.length > 0) flush();
      numbers.push(numbered[1]!);
      continue;
    }

    const quoted = line.match(QUOTE);
    if (quoted) {
      if (paragraph.length > 0 || bullets.length > 0 || numbers.length > 0) flush();
      quote.push(quoted[1]!);
      continue;
    }

    if (bullets.length > 0 || numbers.length > 0 || quote.length > 0) flush();
    paragraph.push(line.trim());
  }

  flush();
  return blocks;
}

/** One-line preview for a card, with the formatting removed rather than rendered. */
export function toPlainText(input: string, limit = 220): string {
  const flat = parseRichText(input)
    .map((block) => {
      switch (block.kind) {
        case 'paragraph':
        case 'quote':
          return block.spans.map((span) => span.text).join('');
        case 'bullets':
        case 'numbers':
          return block.items.map((item) => item.map((span) => span.text).join('')).join(' · ');
        case 'code':
          return block.text;
      }
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}\u2026` : flat;
}
