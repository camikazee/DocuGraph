import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BUILT_IN_TEMPLATES } from './built-in-templates';
import {
  CreateDocumentTemplateDto,
  DocumentTemplateDto,
  UpdateDocumentTemplateDto,
} from './dto/document-template.dto';
import {
  DocumentTemplate,
  DocumentTemplateDocument,
} from './schemas/document-template.schema';

type TemplateRow = Pick<
  DocumentTemplate,
  'uuid' | 'name' | 'description' | 'suggestedPath' | 'contentRaw'
>;

@Injectable()
export class DocumentTemplatesService {
  constructor(
    @InjectModel(DocumentTemplate.name)
    private readonly model: Model<DocumentTemplateDocument>,
  ) {}

  async list(workspaceId: string): Promise<DocumentTemplateDto[]> {
    const custom = await this.model
      .find({ workspaceId })
      .sort({ name: 1 })
      .lean()
      .exec();
    return [...BUILT_IN_TEMPLATES, ...custom.map((row) => this.toDto(row))];
  }

  async create(
    workspaceId: string,
    input: CreateDocumentTemplateDto,
  ): Promise<DocumentTemplateDto> {
    try {
      const created = await this.model.create({
        workspaceId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        suggestedPath: input.suggestedPath.trim(),
        contentRaw: input.contentRaw,
      });
      return this.toDto(created);
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  async update(
    workspaceId: string,
    id: string,
    input: UpdateDocumentTemplateDto,
  ): Promise<DocumentTemplateDto> {
    this.assertCustom(id);
    const changes: Partial<TemplateRow> = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.description !== undefined) {
      changes.description = input.description.trim();
    }
    if (input.suggestedPath !== undefined) {
      changes.suggestedPath = input.suggestedPath.trim();
    }
    if (input.contentRaw !== undefined) changes.contentRaw = input.contentRaw;
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('At least one template field is required');
    }

    try {
      const updated = await this.model.findOneAndUpdate(
        { workspaceId, uuid: id },
        { $set: changes },
        { new: true },
      );
      if (!updated) throw new NotFoundException('Document template not found');
      return this.toDto(updated);
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    this.assertCustom(id);
    const result = await this.model.deleteOne({ workspaceId, uuid: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Document template not found');
    }
  }

  private toDto(row: TemplateRow): DocumentTemplateDto {
    return {
      id: row.uuid,
      name: row.name,
      description: row.description,
      suggestedPath: row.suggestedPath,
      contentRaw: row.contentRaw,
      builtIn: false,
    };
  }

  private assertCustom(id: string): void {
    if (id.startsWith('builtin:')) {
      throw new BadRequestException('Built-in templates are immutable');
    }
  }

  private rethrowPersistenceError(error: unknown): never {
    if ((error as { code?: number })?.code === 11000) {
      throw new BadRequestException('A template with that name already exists');
    }
    throw error;
  }
}
