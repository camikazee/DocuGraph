import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BUILT_IN_FRONTMATTER_SCHEMAS } from './built-in-frontmatter-schemas';
import {
  CreateFrontmatterSchemaDto,
  FrontmatterFieldDto,
  FrontmatterSchemaDto,
  UpdateFrontmatterSchemaDto,
} from './dto/frontmatter-schema.dto';
import {
  FrontmatterSchema,
  FrontmatterSchemaDocument,
} from './schemas/frontmatter-schema.schema';

type FrontmatterSchemaRow = {
  uuid: string;
  name: string;
  description: string;
  fields: FrontmatterFieldDto[];
};

const RESERVED_FIELD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

@Injectable()
export class FrontmatterSchemasService {
  constructor(
    @InjectModel(FrontmatterSchema.name)
    private readonly model: Model<FrontmatterSchemaDocument>,
  ) {}

  async list(workspaceId: string): Promise<FrontmatterSchemaDto[]> {
    const custom = await this.model
      .find({ workspaceId })
      .sort({ name: 1 })
      .lean()
      .exec();
    return [
      ...BUILT_IN_FRONTMATTER_SCHEMAS,
      ...custom.map((row) => this.toDto(row)),
    ];
  }

  async create(
    workspaceId: string,
    input: CreateFrontmatterSchemaDto,
  ): Promise<FrontmatterSchemaDto> {
    const fields = this.normalizeFields(input.fields);
    try {
      const created = await this.model.create({
        workspaceId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        fields,
      });
      return this.toDto(created);
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  async update(
    workspaceId: string,
    id: string,
    input: UpdateFrontmatterSchemaDto,
  ): Promise<FrontmatterSchemaDto> {
    this.assertCustom(id);
    const changes: Partial<Omit<FrontmatterSchemaRow, 'uuid'>> = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.description !== undefined) {
      changes.description = input.description.trim();
    }
    if (input.fields !== undefined) {
      changes.fields = this.normalizeFields(input.fields);
    }
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException(
        'At least one frontmatter schema field is required',
      );
    }

    try {
      const updated = await this.model.findOneAndUpdate(
        { workspaceId, uuid: id },
        { $set: changes },
        { new: true },
      );
      if (!updated) {
        throw new NotFoundException('Frontmatter schema not found');
      }
      return this.toDto(updated);
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    this.assertCustom(id);
    const result = await this.model.deleteOne({ workspaceId, uuid: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Frontmatter schema not found');
    }
  }

  private normalizeFields(
    fields: FrontmatterFieldDto[],
  ): FrontmatterFieldDto[] {
    const normalized = fields.map((field) => ({
      key: field.key.trim(),
      label: field.label.trim(),
      type: field.type,
      required: field.required,
      options: field.options.map((option) => option.trim()),
      defaultValue: field.defaultValue,
    }));

    const keys = new Set<string>();
    for (const field of normalized) {
      if (RESERVED_FIELD_KEYS.has(field.key)) {
        throw new BadRequestException(`Field key "${field.key}" is reserved`);
      }
      if (keys.has(field.key)) {
        throw new BadRequestException('Field keys must be unique');
      }
      keys.add(field.key);

      if (field.type !== 'select' && field.options.length > 0) {
        throw new BadRequestException('Only select fields may define options');
      }
      if (field.type === 'select') {
        if (field.options.length === 0) {
          throw new BadRequestException(
            'Select fields require at least one option',
          );
        }
        if (field.options.some((option) => option.length === 0)) {
          throw new BadRequestException(
            'Select field options must not be empty',
          );
        }
        if (new Set(field.options).size !== field.options.length) {
          throw new BadRequestException('Select field options must be unique');
        }
        if (
          field.defaultValue !== '' &&
          !field.options.includes(field.defaultValue)
        ) {
          throw new BadRequestException(
            'Select field defaults must match an option',
          );
        }
      }
      if (
        field.type === 'number' &&
        field.defaultValue !== '' &&
        !Number.isFinite(Number(field.defaultValue))
      ) {
        throw new BadRequestException('Number field defaults must be numeric');
      }
      if (
        field.type === 'boolean' &&
        !['', 'true', 'false'].includes(field.defaultValue)
      ) {
        throw new BadRequestException(
          'Boolean field defaults must be empty, true, or false',
        );
      }
    }

    return normalized;
  }

  private toDto(row: FrontmatterSchemaRow): FrontmatterSchemaDto {
    return {
      id: row.uuid,
      name: row.name,
      description: row.description,
      fields: row.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        options: [...field.options],
        defaultValue: field.defaultValue,
      })),
      builtIn: false,
    };
  }

  private assertCustom(id: string): void {
    if (id.startsWith('builtin:')) {
      throw new BadRequestException(
        'Built-in frontmatter schemas are immutable',
      );
    }
  }

  private rethrowPersistenceError(error: unknown): never {
    if ((error as { code?: number })?.code === 11000) {
      throw new BadRequestException(
        'A frontmatter schema with that name already exists',
      );
    }
    throw error;
  }
}
