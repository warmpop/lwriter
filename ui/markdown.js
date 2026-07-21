/* ============================================
   lwriter — Markdown Syntax Highlight Engine
   ============================================

   Parses raw markdown text line-by-line and
   produces HTML for the backdrop layer.
   Font metrics must match the textarea exactly.
*/

const Markdown = (() => {
  'use strict';

  /** Escape HTML entities so innerHTML treats text as text. */
  function esc(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Highlight a single inline line (no block elements).
   * Order matters: code before bold/italic, links last.
   */
  function highlightInline(line) {
    // We'll build segments: { text, classes[] }
    let segments = [{ text: line, classes: [] }];

    // Inline code: `...`
    segments = splitApply(segments, /(`+)(.*?)\1/g, (match, p1, p2) => {
      return wrapSpan(p1 + p2 + p1, 'md-code', 'md-syntax', p1, p1);
    });

    // Bold: **...** or __...__
    segments = splitApply(segments, /(\*\*|__)(.*?)\1/g, (match, p1, p2) => {
      return wrapSpan(p1 + p2 + p1, 'md-bold', 'md-syntax', p1, p1);
    });

    // Italic: *...* or _..._ (single, not double)
    segments = splitApply(segments, /(?<!\*)(\*)(?!\*)(.*?)(?<!\*)\1(?!\*)|(?<!_)(_)(?!_)(.*?)(?<!_)\3(?!_)/g,
      (match, starMarker, starContent, usMarker, usContent) => {
        const marker = starMarker !== undefined ? starMarker : usMarker;
        const content = starMarker !== undefined ? starContent : usContent;
        return wrapSpan(marker + content + marker, 'md-italic', 'md-syntax', marker, marker);
      });

    // Strikethrough: ~~...~~
    segments = splitApply(segments, /(~~)(.*?)\1/g, (match, p1, p2) => {
      return wrapSpan(p1 + p2 + p1, 'md-strike', 'md-syntax', p1, p1);
    });

    // Wikilink embeds (Obsidian): ![[image.png]]
    segments = splitApply(segments, /(!\[\[)([^\]]*?)(\]\])/g, (match, open, name, close) => {
      return `<span class="md-syntax">${esc(open)}</span>` +
             `<span class="md-link">${esc(name)}</span>` +
             `<span class="md-syntax">${esc(close)}</span>`;
    });

    // Links: [text](url)
    segments = splitApply(segments, /(\[)(.*?)\]\((.*?)\)/g, (match, openBracket, linkText, url) => {
      return `<span class="md-syntax">${esc(openBracket)}</span>` +
             `<span class="md-link">${esc(linkText)}</span>` +
             `<span class="md-syntax">](</span>` +
             `<span class="md-link md-syntax">${esc(url)}</span>` +
             `<span class="md-syntax">)</span>`;
    });

    // Images: ![alt](url)  — render as styled text
    segments = splitApply(segments, /(!\[)(.*?)\]\((.*?)\)/g, (match, openImg, alt, url) => {
      return `<span class="md-syntax">${esc(openImg)}</span>` +
             `<span class="md-italic">${esc(alt)}</span>` +
             `<span class="md-syntax">](</span>` +
             `<span class="md-syntax">${esc(url)}</span>` +
             `<span class="md-syntax">)</span>`;
    });

    return segmentsToHtml(segments);
  }

  /**
   * Apply a regex to split segments and transform matches.
   */
  function splitApply(segments, regex, fn) {
    const result = [];
    for (const seg of segments) {
      // Already-rendered HTML segments (from an earlier pass) and code spans
      // pass through untouched — reading .text off them crashes the render.
      if (seg.html !== undefined || (seg.classes && seg.classes.indexOf('md-code') !== -1)) {
        result.push(seg);
        continue;
      }
      let lastIndex = 0;
      const s = seg.text;
      let m;
      // Reset regex state
      const re = new RegExp(regex.source, regex.flags);
      while ((m = re.exec(s)) !== null) {
        if (m.index > lastIndex) {
          result.push({ text: s.slice(lastIndex, m.index), classes: seg.classes });
        }
        result.push({ html: fn(m[0], ...m.slice(1)) });
        lastIndex = re.lastIndex;
        if (m[0].length === 0) re.lastIndex++;
      }
      if (lastIndex < s.length) {
        result.push({ text: s.slice(lastIndex), classes: seg.classes });
      }
    }
    return result;
  }

  function wrapSpan(inner, contentClass, syntaxClass, prefix, suffix) {
    prefix = esc(prefix);
    suffix = esc(suffix);
    inner = esc(inner);
    // For code spans the whole thing is code-styled (inner is already escaped)
    if (contentClass === 'md-code') {
      return `<span class="md-syntax">${prefix}</span>` +
             `<span class="md-code">${inner.slice(prefix.length, inner.length - suffix.length)}</span>` +
             `<span class="md-syntax">${suffix}</span>`;
    }
    const content = inner.slice(prefix.length, inner.length - suffix.length);
    return `<span class="md-syntax">${prefix}</span>` +
           `<span class="${contentClass}">${content}</span>` +
           `<span class="md-syntax">${suffix}</span>`;
  }

  function segmentsToHtml(segments) {
    return segments.map(seg => {
      if (seg.html) return seg.html;
      const classes = (seg.classes || []).join(' ');
      const text = esc(seg.text);
      return classes ? `<span class="${classes}">${text}</span>` : text;
    }).join('');
  }

  /**
   * Parse a single line and return highlighted HTML.
   */
  function highlightLine(line) {
    // Empty line
    if (line.trim() === '') return '';

    // Heading: # to ######
    let m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      const level = m[1].length;
      const cls = `md-h${level}`;
      return `<span class="${cls} md-syntax">${esc(m[1])} </span>` +
             `<span class="${cls}">${highlightInlinePlain(m[2])}</span>`;
    }

    // Blockquote: >
    m = line.match(/^>\s?(.*)$/);
    if (m) {
      return `<span class="md-syntax md-quote">&gt; </span>` +
             `<span class="md-quote">${highlightInlinePlain(m[1])}</span>`;
    }

    // Unordered list: - * +
    m = line.match(/^(\s*)([-*+])\s+(.*)$/);
    if (m) {
      const indent = m[1];
      const marker = m[2];
      return `${indent}<span class="md-syntax md-list-marker">${esc(marker)} </span>` +
             `${highlightInline(m[3])}`;
    }

    // Ordered list: 1. 2. etc
    m = line.match(/^(\s*)(\d+\.)\s+(.*)$/);
    if (m) {
      const indent = m[1];
      const marker = m[2];
      return `${indent}<span class="md-syntax md-list-marker">${esc(marker)} </span>` +
             `${highlightInline(m[3])}`;
    }

    // Horizontal rule: --- *** ___
    if (/^[-*_]{3,}\s*$/.test(line)) {
      return `<span class="md-syntax">${esc(line)}</span>`;
    }

    // Regular paragraph
    return highlightInline(line);
  }

  /** Inline highlight without block-level classes (for heading content). */
  function highlightInlinePlain(line) {
    return highlightInline(line)
      .replace(/class="md-h\d"/g, '')  // strip heading class from inline
      .replace(/class="md-quote"/g, '');
  }

  /**
   * Per-line parse cache: highlightLine() runs several regex passes and is
   * the dominant cost when re-rendering large documents on every keystroke.
   * Keying its output by the line's text means only the line you're actually
   * editing gets re-parsed; the rest are cache hits. Cleared wholesale when
   * it grows past a bound (cheap, and typing keeps the working set hot).
   */
  const lineCache = new Map();
  const LINE_CACHE_MAX = 20000;

  function cachedHighlight(line) {
    let html = lineCache.get(line);
    if (html === undefined) {
      html = highlightLine(line);
      if (lineCache.size >= LINE_CACHE_MAX) lineCache.clear();
      lineCache.set(line, html);
    }
    return html;
  }

  /**
   * Main entry point: parse full text into backdrop HTML.
   * Wraps each line in <div class="md-line"> for focus-mode targeting.
   */
  function render(text) {
    const lines = text.split('\n');
    // Joined with '' — whitespace between the divs is NOT collapsed under
    // white-space: pre-wrap and would add phantom line boxes, drifting the
    // backdrop out of alignment with the textarea caret.
    return lines.map((line, i) => {
      const html = cachedHighlight(line);
      return `<div class="md-line md-paragraph" data-line="${i}">${html || '&nbsp;'}</div>`;
    }).join('');
  }

  /**
   * Render markdown to prose HTML for the preview pane.
   * Simple but functional: handles headings, bold, italic, code,
   * blockquotes, links, images, lists, hr.
   */
  function renderPreview(text) {
    let html = esc(text);

    // Generated HTML is stashed behind  N  tokens so the emphasis
    // passes below can't rewrite what's inside it (e.g. the underscores in
    // <img data-msrc="my_cool_image.png"> becoming <em>). Restored before
    // the block pass.
    const tokens = [];
    const stash = (s) => ' ' + (tokens.push(s) - 1) + ' ';

    // Code blocks (fenced) — content is already escaped above
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      stash(`<pre><code>${code.trim()}</code></pre>`));

    // Inline code (must be before bold/italic to avoid nested issues)
    html = html.replace(/`([^`]+)`/g, (_, code) => stash(`<code>${code}</code>`));

    // Obsidian wikilink embeds: ![[image.png]] (an optional |size suffix is
    // accepted and ignored). Local sources become data-msrc placeholders that
    // the app resolves to data: URIs after render (hydrateImages in app.js).
    html = html.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, name) =>
      stash(`<img data-msrc="${name.trim()}" alt="">`));

    // Images: ![alt](src) — remote sources load directly, local ones hydrate
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
      stash(/^(https?:|data:)/i.test(src)
        ? `<img src="${src}" alt="${alt}">`
        : `<img data-msrc="${src}" alt="${alt}">`));

    // Links — the label stays outside the stash so **emphasis** in it works
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
      stash(`<a href="${url}">`) + label + stash('</a>'));

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Restore stashed HTML (looped — a link stash can nest a code stash)
    for (let pass = 0; pass < 10 && html.indexOf(' ') !== -1; pass++) {
      html = html.replace(/ (\d+) /g, (_, i) => tokens[i]);
    }

    // Headings and paragraphs
    const lines = html.split('\n');
    const result = [];
    let inList = false;
    let listType = '';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // HR
      if (/^[-*_]{3,}\s*$/.test(line)) {
        if (inList) { result.push(`</${listType}>`); inList = false; }
        result.push('<hr>');
        continue;
      }

      // Heading
      let m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        if (inList) { result.push(`</${listType}>`); inList = false; }
        const level = m[1].length;
        result.push(`<h${level}>${m[2]}</h${level}>`);
        continue;
      }

      // Blockquote
      m = line.match(/^&gt;\s?(.*)$/);
      if (m) {
        if (inList) { result.push(`</${listType}>`); inList = false; }
        result.push(`<blockquote><p>${m[1]}</p></blockquote>`);
        continue;
      }

      // Unordered list
      m = line.match(/^(\s*)[-*+]\s+(.*)$/);
      if (m) {
        if (!inList || listType !== 'ul') {
          if (inList) result.push(`</${listType}>`);
          result.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        result.push(`<li>${m[2]}</li>`);
        continue;
      }

      // Ordered list
      m = line.match(/^(\s*)\d+\.\s+(.*)$/);
      if (m) {
        if (!inList || listType !== 'ol') {
          if (inList) result.push(`</${listType}>`);
          result.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        result.push(`<li>${m[2]}</li>`);
        continue;
      }

      // Close list if we were in one
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
      }

      // Empty line
      if (line.trim() === '') {
        result.push('');
        continue;
      }

      // Paragraph
      result.push(`<p>${line}</p>`);
    }

    if (inList) result.push(`</${listType}>`);
    return result.join('\n');
  }

  return { render, renderPreview };
})();
