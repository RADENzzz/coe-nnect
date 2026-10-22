import { Fragment, useMemo, type ReactNode } from 'react';

/**
 * Minimal, safe BBCode renderer.
 *
 * Supported tags:
 *   [b]…[/b]  [i]…[/i]  [u]…[/u]  [s]…[/s]
 *   [code]…[/code]  [quote]…[/quote]  [center]…[/center]
 *   [url]https://…[/url]  [url=https://…]label[/url]
 *   [list] [*] item [/list]  [hr]
 *
 * Bare https:// links and **bold** keep working from the old plain-text
 * format, so existing notices do not break.
 *
 * Everything is rendered as React nodes — no `dangerouslySetInnerHTML` — and
 * only http(s) links become anchors, so pasted HTML/`javascript:` URLs can
 * never execute. Unknown tags are shown literally instead of being dropped.
 */
export interface BbcodeTheme {
  linkClassName: string;
  codeClassName?: string;
  quoteClassName?: string;
}

type BbText = { kind: 'text'; value: string };
type BbElement = {
  kind: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: BbNode[];
};
type BbNode = BbText | BbElement;

const SUPPORTED_TAGS = new Set([
  'b',
  'i',
  'u',
  's',
  'code',
  'quote',
  'center',
  'url',
  'list',
  '*',
  'hr',
]);

/** Guards against pathological nesting like [b][b][b]… thousands deep. */
const MAX_DEPTH = 24;

const SAFE_HREF_RE = /^https?:\/\/[^\s]+$/i;

function lastIndexWhere<T>(items: T[], predicate: (item: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i])) return i;
  }
  return -1;
}

function parseBbcode(input: string): BbNode[] {
  const root: BbElement = {
    kind: 'element',
    tag: 'root',
    attrs: {},
    children: [],
  };
  const stack: BbElement[] = [root];
  const top = () => stack[stack.length - 1];

  const pushText = (value: string) => {
    if (!value) return;
    // Whitespace between [list] and the first [*] must not become a stray
    // text node inside the <ul> (it would add a blank line).
    if (top().tag === 'list' && !value.trim()) return;
    top().children.push({ kind: 'text', value });
  };

  const tokenRe = /\[(\/?)([a-zA-Z*]+)(?:=([^\]\n]*))?\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(input)) !== null) {
    const [raw, closing, rawTag, rawAttr] = match;
    const tag = rawTag.toLowerCase();

    pushText(input.slice(lastIndex, match.index));
    lastIndex = match.index + raw.length;

    if (!SUPPORTED_TAGS.has(tag)) {
      // Unknown tag → literal text, never silently swallowed.
      pushText(raw);
      continue;
    }

    if (tag === 'hr') {
      top().children.push({
        kind: 'element',
        tag: 'hr',
        attrs: {},
        children: [],
      });
      continue;
    }

    // [*] list item: closes the previous item and starts a new one.
    if (tag === '*') {
      if (closing) {
        if (top().tag === '*') stack.pop();
        else pushText(raw);
        continue;
      }

      const listIndex = lastIndexWhere(stack, (el) => el.tag === 'list');
      if (listIndex < 1) {
        pushText(raw);
        continue;
      }

      stack.length = listIndex + 1;
      const item: BbElement = {
        kind: 'element',
        tag: '*',
        attrs: {},
        children: [],
      };
      top().children.push(item);
      stack.push(item);
      continue;
    }

    if (closing) {
      const openIndex = lastIndexWhere(stack, (el) => el.tag === tag);
      if (openIndex < 1) {
        pushText(raw);
        continue;
      }
      stack.length = openIndex;
      continue;
    }

    if (stack.length > MAX_DEPTH) {
      pushText(raw);
      continue;
    }

    const element: BbElement = {
      kind: 'element',
      tag,
      attrs:
        rawAttr === undefined
          ? {}
          : { value: rawAttr.trim().replace(/^["']|["']$/g, '') },
      children: [],
    };
    top().children.push(element);
    stack.push(element);
  }

  pushText(input.slice(lastIndex));
  return root.children;
}

function toPlainText(nodes: BbNode[]): string {
  let out = '';
  for (const node of nodes) {
    out += node.kind === 'text' ? node.value : toPlainText(node.children);
  }
  return out;
}

function safeHref(value: string | undefined): string | null {
  const href = value?.trim();
  if (!href || !SAFE_HREF_RE.test(href)) return null;
  return href;
}

const INLINE_RE = /(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s<>"']+)/g;

function renderInlineText(
  text: string,
  theme: BbcodeTheme,
  keyPrefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  const pushPlain = (value: string) => {
    if (value) {
      nodes.push(<Fragment key={`${keyPrefix}-p${key++}`}>{value}</Fragment>);
    }
  };

  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    const [raw, boldText, bareUrl] = match;

    pushPlain(text.slice(lastIndex, match.index));
    lastIndex = match.index + raw.length;

    if (boldText) {
      nodes.push(
        <strong key={`${keyPrefix}-b${key++}`} className="font-bold">
          {boldText.slice(2, -2)}
        </strong>,
      );
      continue;
    }

    if (bareUrl) {
      const cleaned = bareUrl.replace(/[.,;:!?)\]]+$/, '');
      const trailing = bareUrl.slice(cleaned.length);
      const href = safeHref(cleaned);
      if (href) {
        nodes.push(
          <a
            key={`${keyPrefix}-u${key++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${theme.linkClassName} break-all`}
          >
            {cleaned}
          </a>,
        );
      } else {
        pushPlain(cleaned);
      }
      if (trailing) pushPlain(trailing);
    }
  }

  pushPlain(text.slice(lastIndex));
  return nodes;
}

function renderNodes(
  nodes: BbNode[],
  theme: BbcodeTheme,
  keyPrefix: string,
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    if (node.kind === 'text') {
      return (
        <Fragment key={key}>
          {renderInlineText(node.value, theme, key)}
        </Fragment>
      );
    }

    const children = renderNodes(node.children, theme, key);

    switch (node.tag) {
      case 'b':
        return (
          <strong key={key} className="font-bold">
            {children}
          </strong>
        );
      case 'i':
        return <em key={key}>{children}</em>;
      case 'u':
        return (
          <u key={key} className="underline underline-offset-2">
            {children}
          </u>
        );
      case 's':
        return (
          <s key={key} className="line-through opacity-80">
            {children}
          </s>
        );
      case 'code':
        return (
          <code
            key={key}
            className={`whitespace-pre-wrap break-words rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[0.9em] ${
              theme.codeClassName ?? ''
            }`}
          >
            {children}
          </code>
        );
      case 'quote':
        return (
          <blockquote
            key={key}
            className={`my-2 border-l-2 border-current/30 pl-3 italic opacity-90 ${
              theme.quoteClassName ?? ''
            }`}
          >
            {children}
          </blockquote>
        );
      case 'center':
        return (
          <div key={key} className="text-center">
            {children}
          </div>
        );
      case 'list':
        return (
          <ul key={key} className="my-1 list-disc space-y-0.5 pl-5">
            {children}
          </ul>
        );
      case '*':
        return <li key={key}>{children}</li>;
      case 'hr':
        return <hr key={key} className="my-3 border-current/20" />;
      case 'url': {
        const label = toPlainText(node.children).trim();
        const href = safeHref(node.attrs.value) ?? safeHref(label);
        if (!href) return <Fragment key={key}>{children}</Fragment>;
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${theme.linkClassName} break-all`}
          >
            {label || href}
          </a>
        );
      }
      default:
        return <Fragment key={key}>{children}</Fragment>;
    }
  });
}

interface BbcodeProps {
  text: string;
  linkClassName: string;
  codeClassName?: string;
  quoteClassName?: string;
}

/** Renders a BBCode string inside whatever container styles the caller uses. */
export function Bbcode({
  text,
  linkClassName,
  codeClassName,
  quoteClassName,
}: BbcodeProps) {
  const nodes = useMemo(() => parseBbcode(text), [text]);

  return (
    <>
      {renderNodes(
        nodes,
        { linkClassName, codeClassName, quoteClassName },
        'bb',
      )}
    </>
  );
}
