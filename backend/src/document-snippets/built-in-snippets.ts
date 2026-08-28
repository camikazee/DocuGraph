import { DocumentSnippetDto } from './dto/document-snippet.dto';

export const BUILT_IN_SNIPPETS: readonly DocumentSnippetDto[] = [
  {
    id: 'builtin:code-block',
    name: 'Code example',
    description: 'A fenced TypeScript example.',
    contentRaw: ['```ts', 'const value = true;', '```'].join('\n'),
    builtIn: true,
  },
  {
    id: 'builtin:checklist',
    name: 'Checklist',
    description: 'A three-item task checklist.',
    contentRaw: [
      '- [ ] First item',
      '- [ ] Second item',
      '- [ ] Third item',
    ].join('\n'),
    builtIn: true,
  },
  {
    id: 'builtin:mermaid',
    name: 'Mermaid flowchart',
    description: 'A small flowchart rendered by DocuGraph.',
    contentRaw: [
      '```mermaid',
      'flowchart LR',
      '  Start --> Finish',
      '```',
    ].join('\n'),
    builtIn: true,
  },
];
