export interface MarkdownSnippetInsertion {
  value: string;
  caret: number;
}

export function insertMarkdownSnippet(
  value: string,
  snippet: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownSnippetInsertion {
  const from = Math.max(0, Math.min(selectionStart, value.length));
  const to = Math.max(from, Math.min(selectionEnd, value.length));
  const before = value.slice(0, from);
  const after = value.slice(to);
  const prefix =
    before && !before.endsWith('\n\n')
      ? before.endsWith('\n')
        ? '\n'
        : '\n\n'
      : '';
  const suffix =
    after && !after.startsWith('\n\n')
      ? after.startsWith('\n')
        ? '\n'
        : '\n\n'
      : '';
  const inserted = prefix + snippet + suffix;
  return {
    value: before + inserted + after,
    caret: before.length + prefix.length + snippet.length,
  };
}
