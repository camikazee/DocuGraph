import { insertMarkdownSnippet } from './insertMarkdownSnippet';

describe('insertMarkdownSnippet', () => {
  it('inserts at a caret with clean blank-line boundaries', () => {
    expect(
      insertMarkdownSnippet('# Title\nBody', '- [ ] Item', 8, 8),
    ).toEqual({
      value: '# Title\n\n- [ ] Item\n\nBody',
      caret: 19,
    });
  });

  it('replaces the selected range and preserves surrounding text', () => {
    expect(
      insertMarkdownSnippet('Before OLD After', '**new**', 7, 10),
    ).toEqual({
      value: 'Before \n\n**new**\n\n After',
      caret: 16,
    });
  });

  it('avoids adding blank lines at existing document boundaries', () => {
    expect(insertMarkdownSnippet('', 'snippet', 0, 0)).toEqual({
      value: 'snippet',
      caret: 7,
    });
    expect(insertMarkdownSnippet('a\n\nend', 'x', 3, 3)).toEqual({
      value: 'a\n\nx\n\nend',
      caret: 4,
    });
  });

  it('clamps invalid browser selection offsets', () => {
    expect(insertMarkdownSnippet('abc', 'x', -5, 99)).toEqual({
      value: 'x',
      caret: 1,
    });
  });
});
