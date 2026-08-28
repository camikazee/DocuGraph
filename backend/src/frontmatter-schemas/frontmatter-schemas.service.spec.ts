import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { FrontmatterFieldType } from './dto/frontmatter-schema.dto';
import { FrontmatterSchemasService } from './frontmatter-schemas.service';
import { FrontmatterSchema } from './schemas/frontmatter-schema.schema';

function query<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function field(
  key: string,
  type: FrontmatterFieldType = 'text',
  options: string[] = [],
  defaultValue = '',
) {
  return {
    key,
    label: key,
    type,
    required: false,
    options,
    defaultValue,
  };
}

describe('FrontmatterSchemasService', () => {
  const model = {
    find: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
  };
  let service: FrontmatterSchemasService;

  const validFields = [field('owner')];

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        FrontmatterSchemasService,
        { provide: getModelToken(FrontmatterSchema.name), useValue: model },
      ],
    }).compile();
    service = module.get(FrontmatterSchemasService);
  });

  it('lists the built-in schema before tenant-scoped custom schemas', async () => {
    model.find.mockReturnValue(
      query([
        {
          _id: 'internal',
          uuid: 'schema-1',
          name: 'Release',
          description: '',
          fields: validFields,
        },
      ]),
    );
    const result = await service.list('workspace-a');
    expect(result[0]).toEqual(
      expect.objectContaining({ id: 'builtin:basic', builtIn: true }),
    );
    expect(result.at(-1)).toEqual({
      id: 'schema-1',
      name: 'Release',
      description: '',
      fields: validFields,
      builtIn: false,
    });
    expect(result.at(-1)).not.toHaveProperty('_id');
    expect(model.find).toHaveBeenCalledWith({ workspaceId: 'workspace-a' });
  });

  it('trims schema text while preserving field order', async () => {
    model.create.mockImplementation(async (value) => ({
      uuid: 'schema-1',
      ...value,
    }));
    const result = await service.create('workspace-a', {
      name: ' Release ',
      description: ' Deployment metadata ',
      fields: [
        {
          key: 'owner',
          label: ' Owner ',
          type: 'text',
          required: true,
          options: [],
          defaultValue: '',
        },
        field('stage', 'select', [' draft ', 'live'], 'live'),
      ],
    });
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        name: 'Release',
        description: 'Deployment metadata',
        fields: [
          {
            key: 'owner',
            label: 'Owner',
            type: 'text',
            required: true,
            options: [],
            defaultValue: '',
          },
          {
            ...field('stage', 'select', ['draft', 'live'], 'live'),
            label: 'stage',
          },
        ],
      }),
    );
    expect(result.fields.map((item) => item.key)).toEqual(['owner', 'stage']);
  });

  it.each([
    [[field('owner'), field('owner')], 'Field keys must be unique'],
    [[field('__proto__')], 'Field key "__proto__" is reserved'],
    [
      [field('stage', 'select', [])],
      'Select fields require at least one option',
    ],
    [
      [field('stage', 'select', ['draft', ' draft '])],
      'Select field options must be unique',
    ],
    [
      [field('stage', 'select', ['  '])],
      'Select field options must not be empty',
    ],
    [
      [field('owner', 'text', ['somebody'])],
      'Only select fields may define options',
    ],
    [
      [field('priority', 'number', [], 'high')],
      'Number field defaults must be numeric',
    ],
    [
      [field('featured', 'boolean', [], 'yes')],
      'Boolean field defaults must be empty, true, or false',
    ],
    [
      [field('stage', 'select', ['draft'], 'live')],
      'Select field defaults must match an option',
    ],
  ])('rejects invalid field collections', async (fields, message) => {
    await expect(
      service.create('workspace-a', {
        name: 'Invalid',
        description: '',
        fields,
      }),
    ).rejects.toThrow(message);
  });

  it('preserves text, date, and list defaults exactly', async () => {
    model.create.mockImplementation(async (value) => ({
      uuid: 'schema-1',
      ...value,
    }));
    const fields = [
      field('title', 'text', [], '  Keep spaces  '),
      field('released', 'date', [], '2026-08-28'),
      field('tags', 'list', [], 'one, two'),
    ];
    const result = await service.create('workspace-a', {
      name: 'Defaults',
      description: '',
      fields,
    });
    expect(result.fields.map((item) => item.defaultValue)).toEqual([
      '  Keep spaces  ',
      '2026-08-28',
      'one, two',
    ]);
  });

  it('rejects built-in mutation and scopes custom mutation by workspace', async () => {
    await expect(
      service.remove('workspace-a', 'builtin:basic'),
    ).rejects.toThrow('Built-in frontmatter schemas are immutable');
    model.findOneAndUpdate.mockResolvedValue(null);
    await expect(
      service.update('workspace-b', 'schema-1', { name: 'Changed' }),
    ).rejects.toThrow('Frontmatter schema not found');
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { workspaceId: 'workspace-b', uuid: 'schema-1' },
      { $set: { name: 'Changed' } },
      { new: true },
    );
  });

  it('normalizes and validates all fields supplied to an update', async () => {
    model.findOneAndUpdate.mockImplementation(async (_filter, update) => ({
      uuid: 'schema-1',
      name: 'Release',
      description: '',
      fields: update.$set.fields,
    }));
    await service.update('workspace-a', 'schema-1', {
      fields: [field('stage', 'select', [' draft ', 'live'], 'draft')],
    });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { workspaceId: 'workspace-a', uuid: 'schema-1' },
      {
        $set: {
          fields: [field('stage', 'select', ['draft', 'live'], 'draft')],
        },
      },
      { new: true },
    );
  });

  it('rejects empty updates', async () => {
    await expect(service.update('workspace-a', 'schema-1', {})).rejects.toThrow(
      new BadRequestException(
        'At least one frontmatter schema field is required',
      ),
    );
  });

  it('maps duplicate names to a safe validation error', async () => {
    model.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.create('workspace-a', {
        name: 'Release',
        description: '',
        fields: validFields,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'A frontmatter schema with that name already exists',
      ),
    );
  });

  it('scopes deletion by workspace and maps a missing schema', async () => {
    model.deleteOne.mockResolvedValue({ deletedCount: 0 });
    await expect(service.remove('workspace-b', 'schema-1')).rejects.toThrow(
      new NotFoundException('Frontmatter schema not found'),
    );
    expect(model.deleteOne).toHaveBeenCalledWith({
      workspaceId: 'workspace-b',
      uuid: 'schema-1',
    });
  });
});
