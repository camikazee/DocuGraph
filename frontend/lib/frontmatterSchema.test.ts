import type { FrontmatterField } from './api/frontmatter-schemas';
import {
  applyFrontmatterSchema,
  readFrontmatterValues,
} from './frontmatterSchema';

const field = (
  key: string,
  label: string,
  type: FrontmatterField['type'],
  overrides: Partial<FrontmatterField> = {},
): FrontmatterField => ({
  key,
  label,
  type,
  required: false,
  options: [],
  defaultValue: '',
  ...overrides,
});

const textField = field('owner', 'Owner', 'text');
const requiredText = field('owner', 'Owner', 'text', { required: true });
const numberField = field('priority', 'Priority', 'number');
const booleanField = field('draft', 'Draft', 'boolean');
const dateField = field('reviewed', 'Reviewed', 'date');
const selectField = field('stage', 'Stage', 'select', {
  options: ['draft', 'live'],
});
const listField = field('tags', 'Tags', 'list');
const fields = [
  field('title', 'Title', 'text'),
  listField,
  booleanField,
  numberField,
];

describe('frontmatter schema utility', () => {
  it('reads supported values from an existing frontmatter block', () => {
    const content =
      '---\ntitle: "Guide"\ntags: [api, "public"]\ndraft: false\npriority: 3\n---\n\n# Body';

    expect(readFrontmatterValues(content, fields)).toEqual({
      title: 'Guide',
      tags: 'api, public',
      draft: 'false',
      priority: '3',
    });
  });

  it('uses defaults for absent fields and decodes escaped quoted strings', () => {
    const configured = field('title', 'Title', 'text', {
      defaultValue: 'Untitled',
    });
    expect(readFrontmatterValues('---\nowner: docs\n---\nBody', [configured])).toEqual(
      { title: 'Untitled' },
    );
    expect(
      readFrontmatterValues('---\ntitle: "A \\"quoted\\" guide"\n---\n', [
        configured,
      ]),
    ).toEqual({ title: 'A "quoted" guide' });
  });

  it('updates managed fields while preserving unknown YAML and the body', () => {
    const content =
      '---\ntitle: Old\nowner: platform\ncustom:\n  nested: true\n  values:\n    - one\n# keep this comment\n---\n\n# Body';
    const result = applyFrontmatterSchema(content, fields, {
      title: 'New guide',
      tags: 'api, public',
      draft: 'true',
      priority: '4',
    });

    expect(result.value).toBe(
      '---\ntitle: "New guide"\nowner: platform\ncustom:\n  nested: true\n  values:\n    - one\n# keep this comment\ntags: ["api", "public"]\ndraft: true\npriority: 4\n---\n\n# Body',
    );
    expect(result.caret).toBe(result.value.indexOf('\n---\n') + 1);
  });

  it('preserves unmanaged bytes and the Markdown body when replacing a managed block', () => {
    const content =
      '---\r\nowner: old\r\nunknown: |\r\n  exact: value  \r\n\r\n# comment\r\n---\r\nBody\r\n';
    const result = applyFrontmatterSchema(content, [textField], {
      owner: 'Docs team',
    });

    expect(result.value).toBe(
      '---\r\nowner: "Docs team"\r\nunknown: |\r\n  exact: value  \r\n\r\n# comment\r\n---\r\nBody\r\n',
    );
  });

  it('creates frontmatter without changing Markdown and supports CRLF input', () => {
    const result = applyFrontmatterSchema('# Body\r\n', [textField], {
      owner: 'Docs team',
    });
    expect(result.value).toBe(
      '---\r\nowner: "Docs team"\r\n---\r\n\r\n# Body\r\n',
    );
    expect(result.caret).toBe(result.value.indexOf('\r\n---\r\n') + 2);
  });

  it('serializes user text and list items without creating YAML structure', () => {
    const result = applyFrontmatterSchema('# Body', [textField, listField], {
      owner: 'Docs\nadmin: true',
      tags: 'api, value: unsafe, "quoted"',
    });

    expect(result.value).toContain('owner: "Docs\\nadmin: true"\n');
    expect(result.value).toContain(
      'tags: ["api", "value: unsafe", "\\\"quoted\\\""]\n',
    );
  });

  it('rejects missing required and invalid typed values', () => {
    expect(() =>
      applyFrontmatterSchema('# Body', [requiredText], { owner: '' }),
    ).toThrow('Owner is required');
    expect(() =>
      applyFrontmatterSchema('# Body', [numberField], { priority: 'high' }),
    ).toThrow('Priority must be a number');
    expect(() =>
      applyFrontmatterSchema('# Body', [booleanField], { draft: 'yes' }),
    ).toThrow('Draft must be true or false');
    expect(() =>
      applyFrontmatterSchema('# Body', [dateField], { reviewed: '28/08/2026' }),
    ).toThrow('Reviewed must use YYYY-MM-DD');
    expect(() =>
      applyFrontmatterSchema('# Body', [dateField], { reviewed: '2026-02-30' }),
    ).toThrow('Reviewed must use YYYY-MM-DD');
    expect(() =>
      applyFrontmatterSchema('# Body', [selectField], { stage: 'unknown' }),
    ).toThrow('Stage has an unsupported value');
    expect(() =>
      applyFrontmatterSchema(
        '# Body',
        [field('tags', 'Tags', 'list', { required: true })],
        { tags: ', ,' },
      ),
    ).toThrow('Tags is required');
  });
});
