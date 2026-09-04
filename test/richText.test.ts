import { parseInline, parseRichText, toPlainText } from '../src/text/richText';

/**
 * These tests carry more weight than their size suggests: the parser exists so that text
 * people type never becomes an HTML string. Most of what follows checks that unsupported or
 * hostile input degrades to literal text rather than to markup.
 */

describe('parseInline', () => {
  it('keeps plain text as a single span', () => {
    expect(parseInline('just words')).toEqual([{ kind: 'text', text: 'just words' }]);
  });

  it('reads inline code', () => {
    expect(parseInline('use `npm run news` nightly')).toEqual([
      { kind: 'text', text: 'use ' },
      { kind: 'code', text: 'npm run news' },
      { kind: 'text', text: ' nightly' },
    ]);
  });

  it('reads bold', () => {
    expect(parseInline('**shipped** on Friday')).toEqual([
      { kind: 'strong', text: 'shipped' },
      { kind: 'text', text: ' on Friday' },
    ]);
  });

  it('reads a labelled link', () => {
    expect(parseInline('see [the PR](https://github.com/corp/x/pull/1)')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'the PR', href: 'https://github.com/corp/x/pull/1' },
    ]);
  });

  it('links a bare URL and leaves the sentence punctuation outside it', () => {
    expect(parseInline('read https://cursor.com/docs.')).toEqual([
      { kind: 'text', text: 'read ' },
      { kind: 'link', text: 'https://cursor.com/docs', href: 'https://cursor.com/docs' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('refuses a javascript: link and renders it as text', () => {
    const spans = parseInline('[click](javascript:alert(1))');
    expect(spans.every((span) => span.kind !== 'link')).toBe(true);
    expect(spans.map((span) => span.text).join('')).toContain('javascript:alert(1)');
  });

  it('refuses a data: link', () => {
    expect(parseInline('[x](data:text/html,<script>)').some((span) => span.kind === 'link')).toBe(
      false,
    );
  });

  it('treats angle brackets as ordinary characters', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      { kind: 'text', text: '<script>alert(1)</script>' },
    ]);
  });

  it('leaves an unclosed marker alone rather than guessing', () => {
    expect(parseInline('a ** dangling marker')).toEqual([
      { kind: 'text', text: 'a ** dangling marker' },
    ]);
  });
});

describe('parseRichText', () => {
  it('joins wrapped lines into one paragraph', () => {
    const blocks = parseRichText('one line\nand its continuation');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'paragraph' });
    expect(toPlainText('one line\nand its continuation')).toBe('one line and its continuation');
  });

  it('separates paragraphs on a blank line', () => {
    expect(parseRichText('first\n\nsecond').map((block) => block.kind)).toEqual([
      'paragraph',
      'paragraph',
    ]);
  });

  it('collects bullets into one list', () => {
    const blocks = parseRichText('- one\n- two\n* three');
    expect(blocks).toHaveLength(1);

    const block = blocks[0]!;
    if (block.kind !== 'bullets') throw new Error(`expected bullets, got ${block.kind}`);
    expect(block.items).toHaveLength(3);
  });

  it('keeps numbered and bulleted lists apart', () => {
    expect(parseRichText('1. one\n2. two\n- three').map((block) => block.kind)).toEqual([
      'numbers',
      'bullets',
    ]);
  });

  it('ends a list when a paragraph follows', () => {
    expect(parseRichText('- one\nnot a bullet').map((block) => block.kind)).toEqual([
      'bullets',
      'paragraph',
    ]);
  });

  it('reads a quote', () => {
    expect(parseRichText('> somebody said this').map((block) => block.kind)).toEqual(['quote']);
  });

  it('keeps a fenced block verbatim, including its markers', () => {
    const blocks = parseRichText('before\n```ts\nconst a = `1`;\n- not a bullet\n```\nafter');
    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'code', 'paragraph']);
    expect(blocks[1]).toEqual({
      kind: 'code',
      language: 'ts',
      text: 'const a = `1`;\n- not a bullet',
    });
  });

  it('handles an unterminated fence by taking the rest of the input', () => {
    const blocks = parseRichText('```\nstill code');
    expect(blocks).toEqual([{ kind: 'code', text: 'still code', language: undefined }]);
  });

  it('returns nothing for empty input', () => {
    expect(parseRichText('')).toEqual([]);
    expect(parseRichText('   \n  ')).toEqual([]);
  });

  it('normalises Windows line endings', () => {
    expect(parseRichText('a\r\n\r\nb').map((block) => block.kind)).toEqual([
      'paragraph',
      'paragraph',
    ]);
  });
});

describe('toPlainText', () => {
  it('strips formatting rather than rendering it', () => {
    expect(toPlainText('**bold** and `code` and [a link](https://x.test)')).toBe(
      'bold and code and a link',
    );
  });

  it('joins list items with a separator so a preview reads as one line', () => {
    expect(toPlainText('- one\n- two')).toBe('one · two');
  });

  it('truncates with an ellipsis and never exceeds the limit', () => {
    const long = 'word '.repeat(80);
    const preview = toPlainText(long, 40);
    expect(preview.length).toBeLessThanOrEqual(40);
    expect(preview.endsWith('\u2026')).toBe(true);
  });

  it('leaves short text untouched', () => {
    expect(toPlainText('short', 40)).toBe('short');
  });
});
