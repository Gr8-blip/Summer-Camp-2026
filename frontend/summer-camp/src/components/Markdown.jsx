import React from "react";
import "./Markdown.css";

/**
 * Markdown — turns a plain text string into nicely formatted React
 * elements. No external library required (keeps the bundle small and
 * avoids adding a new dependency for a handful of formatting rules).
 *
 * Supports the things teachers actually use in instructions:
 *   # / ## / ###           → headings
 *   **bold** or __bold__   → <strong>
 *   *italic* or _italic_   → <em>
 *   `code`                 → <code>
 *   [text](url)            → link (opens in a new tab)
 *   - item / * item        → bullet list
 *   1. item                → numbered list
 *   one newline            → a visible line break (<br />)
 *   blank line             → a new paragraph
 *
 * Anything that isn't one of the patterns above is shown exactly as
 * typed, so plain, non-markdown instructions look identical to before.
 */

// Turns "**bold** and `code` and [a link](url)" into an array of
// strings and React nodes, in order, left to right.
function renderInline(text, keyPrefix) {
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\)/;
  const nodes = [];
  let remaining = text;
  let key = 0;

  while (remaining.length) {
    const match = pattern.exec(remaining);
    if (!match) {
      nodes.push(remaining);
      break;
    }

    const [full, code, boldStar, boldUnder, italicStar, italicUnder, linkText, linkUrl] = match;
    if (match.index > 0) nodes.push(remaining.slice(0, match.index));

    if (code !== undefined) {
      nodes.push(<code key={`${keyPrefix}-${key++}`}>{code}</code>);
    } else if (boldStar !== undefined || boldUnder !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${key++}`}>{boldStar ?? boldUnder}</strong>);
    } else if (italicStar !== undefined || italicUnder !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${key++}`}>{italicStar ?? italicUnder}</em>);
    } else if (linkText !== undefined) {
      nodes.push(
        <a key={`${keyPrefix}-${key++}`} href={linkUrl} target="_blank" rel="noopener noreferrer">
          {linkText}
        </a>
      );
    }

    remaining = remaining.slice(match.index + full.length);
  }

  return nodes;
}

// A single "\n" inside a paragraph (Shift+Enter / one Enter) becomes a
// visible <br />, instead of being swallowed the way raw HTML normally
// collapses whitespace.
function renderLineWithBreaks(block, keyPrefix) {
  const lines = block.split("\n");
  return lines.flatMap((line, i) => {
    const inline = renderInline(line, `${keyPrefix}-l${i}`);
    return i < lines.length - 1 ? [...inline, <br key={`${keyPrefix}-br${i}`} />] : inline;
  });
}

export default function Markdown({ text, className, as = "div", style, ...rest }) {
  if (!text) return null;

  // Two (or more) blank lines in a row = a new paragraph/block — the
  // normal markdown rule, and how teachers naturally write multi-part
  // instructions (Enter twice for a new paragraph).
  const blocks = String(text).replace(/\r\n/g, "\n").split(/\n{2,}/);
  const Wrapper = as;

  return (
    <Wrapper className={className ? `md ${className}` : "md"} style={style} {...rest}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.length > 0);
        if (lines.length === 0) return null;

        // "# Heading" / "## Heading" / "### Heading" on its own line
        const headingMatch = lines.length === 1 && lines[0].match(/^(#{1,3})\s+(.*)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const HeadingTag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
          return React.createElement(
            HeadingTag,
            { key: bi, className: "md-heading" },
            renderInline(headingMatch[2], `${bi}-h`)
          );
        }

        // A block where every line starts with "- " / "* " → bullet list
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={bi} className="md-list">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^[-*]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }

        // A block where every line starts with "1. " / "2. " → numbered list
        if (lines.every((l) => /^\d+\.\s+/.test(l))) {
          return (
            <ol key={bi} className="md-list">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^\d+\.\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ol>
          );
        }

        // Otherwise: a normal paragraph — single newlines inside it
        // become <br />, matching the instructions above.
        return (
          <p key={bi} className="md-paragraph">
            {renderLineWithBreaks(block, `${bi}`)}
          </p>
        );
      })}
    </Wrapper>
  );
}