import { FrontmatterSchemaDto } from './dto/frontmatter-schema.dto';

export const BUILT_IN_FRONTMATTER_SCHEMAS: readonly FrontmatterSchemaDto[] = [
  {
    id: 'builtin:basic',
    name: 'Basic document',
    description: 'Title, tags, lifecycle status, and version.',
    builtIn: true,
    fields: [
      {
        key: 'title',
        label: 'Title',
        type: 'text',
        required: false,
        options: [],
        defaultValue: '',
      },
      {
        key: 'tags',
        label: 'Tags',
        type: 'list',
        required: false,
        options: [],
        defaultValue: '',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        required: false,
        options: ['draft', 'review', 'published', 'archived'],
        defaultValue: 'draft',
      },
      {
        key: 'version',
        label: 'Version',
        type: 'text',
        required: false,
        options: [],
        defaultValue: '',
      },
    ],
  },
];
