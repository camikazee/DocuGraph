import { MarkdownParserService } from './markdown-parser.service';

describe('MarkdownParserService', () => {
  const parser = new MarkdownParserService();

  it('parsuje front matter do metadata', () => {
    const raw = `---\ntitle: Auth Guide\ntags: [auth, security]\nstatus: published\nversion: 1.2\n---\n\nTreść.`;
    const res = parser.parse(raw, 'docs/api/auth.md');
    expect(res.title).toBe('Auth Guide');
    expect(res.metadata.tags).toEqual(['auth', 'security']);
    expect(res.metadata.status).toBe('published');
    expect(res.metadata.version).toBe('1.2');
  });

  it('renderuje Markdown do HTML', () => {
    const res = parser.parse('# Hello\n\nSome **bold** text.', 'a.md');
    expect(res.html).toContain('<h1>Hello</h1>');
    expect(res.html).toContain('<strong>bold</strong>');
  });

  it('tytuł z H1 gdy brak front matter', () => {
    const res = parser.parse('# My Page\n\ntext', 'docs/page.md');
    expect(res.title).toBe('My Page');
  });

  it('tytuł z nazwy pliku gdy brak FM i H1', () => {
    const res = parser.parse('just text', 'docs/readme.md');
    expect(res.title).toBe('readme');
  });

  it('ekstrahuje i kanonizuje linki wewnętrzne', () => {
    const raw = [
      'See [docker](../devops/docker.md) and [api](./auth.md#section).',
      'External [site](https://example.com) ignored.',
      'Image [n](notes.txt) ignored.',
    ].join('\n');
    const res = parser.parse(raw, 'docs/api/index.md');
    expect(res.outgoingLinks).toContain('docs/devops/docker.md');
    expect(res.outgoingLinks).toContain('docs/api/auth.md');
    expect(res.outgoingLinks).not.toContain('https://example.com');
    expect(res.outgoingLinks).toHaveLength(2);
  });
});
