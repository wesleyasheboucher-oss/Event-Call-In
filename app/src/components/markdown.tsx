import { Marked } from "marked";
import { clsx } from "clsx";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#)/i;

// Raw HTML is shown as text and only safe link schemes are allowed.
const md = new Marked({ gfm: true, breaks: true });
md.use({
  renderer: {
    html({ text }) {
      return escape(text);
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!SAFE_HREF.test(href)) return label;
      const t = title ? ` title="${escape(title)}"` : "";
      return `<a href="${escape(href)}"${t} target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
    image({ text }) {
      return escape(text);
    },
  },
});

export function renderMarkdown(src: string): string {
  return md.parse(src ?? "", { async: false }) as string;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div
      className={clsx("prose-lite text-[15px] leading-relaxed text-ink-2", className)}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  );
}
