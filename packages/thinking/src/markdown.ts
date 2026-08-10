import DOMPurify from 'dompurify';
import { marked } from 'marked';

export interface MarkdownHeading {
  id: string;
  level: 2 | 3;
  text: string;
}

export interface RenderedMarkdown {
  headings: MarkdownHeading[];
  html: string;
}

function createHeadingId(text: string, index: number) {
  const normalizedText = text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

  return normalizedText || `section-${index + 1}`;
}

function decodeLinkValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function renderMarkdown(content: string, noteLinks: ReadonlyMap<string, string>): RenderedMarkdown {
  const unsafeHtml = marked.parse(content, { async: false, gfm: true });
  const sanitizedHtml = DOMPurify.sanitize(unsafeHtml, {
    RETURN_TRUSTED_TYPE: false,
    USE_PROFILES: { html: true },
  });
  const template = document.createElement('template');
  template.innerHTML = sanitizedHtml;

  // 页面头部已经呈现标题和摘要，正文移除对应的 H1 与开篇引用，避免重复阅读。
  template.content.querySelector('h1')?.remove();
  if (template.content.firstElementChild?.tagName === 'BLOCKQUOTE') {
    template.content.firstElementChild.remove();
  }

  const usedIds = new Map<string, number>();
  const headings = Array.from(template.content.querySelectorAll<HTMLHeadingElement>('h2, h3')).map(
    (heading, index) => {
      const baseId = createHeadingId(heading.textContent?.trim() ?? '', index);
      const duplicateIndex = usedIds.get(baseId) ?? 0;
      usedIds.set(baseId, duplicateIndex + 1);
      const id = duplicateIndex === 0 ? baseId : `${baseId}-${duplicateIndex + 1}`;
      const level = heading.tagName === 'H2' ? 2 : 3;

      heading.id = id;

      return {
        id,
        level,
        text: heading.textContent?.trim() || `章节 ${index + 1}`,
      } satisfies MarkdownHeading;
    },
  );

  template.content.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (!href) {
      return;
    }

    const linkedFileName = decodeLinkValue(href.split('/').at(-1) ?? '').replace(/#.*$/, '');
    const linkedNoteId = noteLinks.get(linkedFileName);
    if (linkedNoteId) {
      anchor.href = `/thinking/${encodeURIComponent(linkedNoteId)}`;
      anchor.dataset.noteLink = 'true';
      return;
    }

    if (/^https?:\/\//i.test(href)) {
      anchor.target = '_blank';
      anchor.rel = 'noreferrer noopener';
    }
  });

  return {
    headings,
    html: template.innerHTML,
  };
}
