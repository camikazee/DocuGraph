import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BUILT_IN_SNIPPETS } from './built-in-snippets';
import {
  CreateDocumentSnippetDto,
  DocumentSnippetDto,
  UpdateDocumentSnippetDto,
} from './dto/document-snippet.dto';
import {
  DocumentSnippet,
  DocumentSnippetDocument,
} from './schemas/document-snippet.schema';

type SnippetRow = Pick<
  DocumentSnippet,
  'uuid' | 'name' | 'description' | 'contentRaw'
>;

@Injectable()
export class DocumentSnippetsService {
  constructor(
    @InjectModel(DocumentSnippet.name)
    private readonly model: Model<DocumentSnippetDocument>,
  ) {}

  async list(workspaceId: string): Promise<DocumentSnippetDto[]> {
    const custom = await this.model
      .find({ workspaceId })
      .sort({ name: 1 })
      .lean()
      .exec();
    return [...BUILT_IN_SNIPPETS, ...custom.map((row) => this.toDto(row))];
  }

  async create(
    workspaceId: string,
    input: CreateDocumentSnippetDto,
  ): Promise<DocumentSnippetDto> {
    try {
      const created = await this.model.create({
        workspaceId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
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
    input: UpdateDocumentSnippetDto,
  ): Promise<DocumentSnippetDto> {
    this.assertCustom(id);
    const changes: Partial<SnippetRow> = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.description !== undefined) {
      changes.description = input.description.trim();
    }
    if (input.contentRaw !== undefined) changes.contentRaw = input.contentRaw;
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('At least one snippet field is required');
    }

    try {
      const updated = await this.model.findOneAndUpdate(
        { workspaceId, uuid: id },
        { $set: changes },
        { new: true },
      );
      if (!updated) throw new NotFoundException('Document snippet not found');
      return this.toDto(updated);
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    this.assertCustom(id);
    const result = await this.model.deleteOne({ workspaceId, uuid: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Document snippet not found');
    }
  }

  private toDto(row: SnippetRow): DocumentSnippetDto {
    return {
      id: row.uuid,
      name: row.name,
      description: row.description,
      contentRaw: row.contentRaw,
      builtIn: false,
    };
  }

  private assertCustom(id: string): void {
    if (id.startsWith('builtin:')) {
      throw new BadRequestException('Built-in snippets are immutable');
    }
  }

  private rethrowPersistenceError(error: unknown): never {
    if ((error as { code?: number })?.code === 11000) {
      throw new BadRequestException('A snippet with that name already exists');
    }
    throw error;
  }
}
