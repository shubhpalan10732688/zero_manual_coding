import type { Block, Span } from '@core/text/richText';
import { parseRichText } from '@core/text/richText';

/**
 * Renders what people wrote.
 *
 * The parser produces a structure and this turns it into elements, so no user-supplied text
 * ever becomes HTML. There is nothing to sanitise because there is no markup: a link is a
 * React <a> with an href the parser already restricted to http, https or mailto.
 */

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, index) => {
        const key = `${span.kind}-${index}`;
        switch (span.kind) {
          case 'code':
            return <code key={key}>{span.text}</code>;
          case 'strong':
            return <strong key={key}>{span.text}</strong>;
          case 'link':
            return (
              <a key={key} href={span.href} target="_blank" rel="noopener noreferrer">
                {span.text}
              </a>
            );
          default:
            return <span key={key}>{span.text}</span>;
        }
      })}
    </>
  );
}

function BlockView({ block, index }: { block: Block; index: number }) {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p>
          <Spans spans={block.spans} />
        </p>
      );
    case 'quote':
      return (
        <blockquote>
          <Spans spans={block.spans} />
        </blockquote>
      );
    case 'bullets':
      return (
        <ul>
          {block.items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`}>
              <Spans spans={item} />
            </li>
          ))}
        </ul>
      );
    case 'numbers':
      return (
        <ol>
          {block.items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`}>
              <Spans spans={item} />
            </li>
          ))}
        </ol>
      );
    case 'code':
      return (
        <div className="ui-codeblock">
          {block.language && <div className="ui-codeblock-head">{block.language}</div>}
          <pre>{block.text}</pre>
        </div>
      );
  }
}

export function RichText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text || !text.trim()) return null;
  const blocks = parseRichText(text);

  return (
    <div className={className ? `ui-rich ${className}` : 'ui-rich'}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} index={index} />
      ))}
    </div>
  );
}

/** A labelled block of written content, as the board and library detail pages use. */
export function Section({
  label,
  text,
}: {
  label: string;
  text: string | null | undefined;
}) {
  if (!text || !text.trim()) return null;
  return (
    <div>
      <div className="ui-section-label">{label}</div>
      <RichText text={text} />
    </div>
  );
}
