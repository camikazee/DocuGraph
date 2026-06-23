import { Injectable } from '@nestjs/common';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import * as path from 'path';

export interface ParsedDocument {
  title: string;
  html: string;
  metadata: {
    tags: string[];
    status: string | null;
    version: string | null;
  };
  outgoingLinks: string[];
}

/**
 * Parser dokumentu Markdown (Faza 2 pipeline'u).
 * Uwaga: używamy markdown-it (CommonJS) zamiast remark/unified (ESM-only) —
 * spec dopuszcza równoważny parser.
 */
@Injectable()
export class MarkdownParserService {
  private readonly md = new MarkdownIt({ html: false, linkify: true });

  parse(raw: string, filePath: string): ParsedDocument {
    const { data, content } = matter(raw);

    const metadata = {
      tags: Array.isArray(data.tags)
        ? data.tags.map((t: unknown) => String(t))
        : [],
      status: typeof data.status === 'string' ? data.status : null,
      version:
        data.version !== undefined && data.version !== null
          ? String(data.version)
          : null,
    };

    const title =
      (typeof data.title === 'string' && data.title.trim()) ||
      this.firstH1(content) ||
      path.posix.basename(filePath, '.md');

    const html = this.md.render(content);
    const outgoingLinks = this.extractInternalLinks(content, filePath);

    return { title, html, metadata, outgoingLinks };
  }

  private firstH1(content: string): string | null {
    const match = content.match(/^#\s+(.+?)\s*$/m);
    return match ? match[1].trim() : null;
  }

  /** Wyciąga linki do wewnętrznych plików .md i kanonizuje ścieżki. */
  private extractInternalLinks(content: string, filePath: string): string[] {
    const linkRegex = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    const baseDir = path.posix.dirname(filePath);
    const result = new Set<string>();

    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(content)) !== null) {
      const target = m[1].split('#')[0].split('?')[0].trim();
      if (!target) continue;
      if (/^[a-z]+:\/\//i.test(target) || target.startsWith('mailto:')) {
        continue; // link zewnętrzny
      }
      if (!target.toLowerCase().endsWith('.md')) {
        continue;
      }
      const resolved = path.posix
        .normalize(path.posix.join(baseDir, target))
        .replace(/^(\.\/)+/, '');
      if (!resolved.startsWith('..')) {
        result.add(resolved);
      }
    }
    return [...result];
  }
}
