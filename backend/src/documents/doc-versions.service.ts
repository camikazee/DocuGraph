import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DocumentEntity,
  DocumentEntityDocument,
} from './schemas/document.schema';
import { DocVersion, DocVersionDocument } from './schemas/doc-version.schema';
import {
  DocVersionFile,
  DocVersionFileDocument,
} from './schemas/doc-version-file.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { AccessChecker } from '../access/access.service';

@Injectable()
export class DocVersionsService {
  constructor(
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentEntityDocument>,
    @InjectModel(DocVersion.name)
    private readonly versionModel: Model<DocVersionDocument>,
    @InjectModel(DocVersionFile.name)
    private readonly fileModel: Model<DocVersionFileDocument>,
  ) {}

  async list(workspaceId: string) {
    const versions = await this.versionModel
      .find({ workspaceId })
      .sort({ createdAt: -1 })
      .populate<{ createdBy: UserDocument | null }>('createdBy', 'name')
      .lean()
      .exec();
    return versions.map((v) => ({
      id: v.uuid,
      label: v.label,
      docCount: v.docCount,
      by: v.createdBy
        ? (v.createdBy as unknown as { name: string }).name
        : null,
      createdAt: (v as unknown as { createdAt: Date }).createdAt,
    }));
  }

  /** Zamraża bieżący zestaw dokumentów pod etykietą (migawka wydania). */
  async publish(workspaceId: string, labelRaw: string, actorId: string | null) {
    const label = labelRaw.trim();
    if (!label) throw new BadRequestException('A version label is required');
    const exists = await this.versionModel
      .findOne({ workspaceId, label })
      .lean()
      .exec();
    if (exists) {
      throw new BadRequestException(`Version "${label}" already exists`);
    }

    const docs = await this.documentModel
      .find({ workspaceId })
      .select('filePath title contentHtml contentRaw')
      .lean()
      .exec();
    if (docs.length === 0) {
      throw new BadRequestException('Nothing to publish — no documents yet');
    }

    const version = await this.versionModel.create({
      workspaceId,
      label,
      createdBy: actorId ? new Types.ObjectId(actorId) : null,
      docCount: docs.length,
    });
    await this.fileModel.insertMany(
      docs.map((d) => ({
        versionId: version._id,
        workspaceId: new Types.ObjectId(workspaceId),
        filePath: d.filePath,
        title: d.title,
        contentHtml: d.contentHtml ?? '',
        contentRaw: d.contentRaw ?? '',
      })),
    );

    return {
      id: version.uuid,
      label: version.label,
      docCount: version.docCount,
    };
  }

  async remove(workspaceId: string, versionUuid: string) {
    const version = await this.versionModel
      .findOne({ workspaceId, uuid: versionUuid })
      .exec();
    if (!version) throw new NotFoundException('Version not found');
    await this.fileModel.deleteMany({ versionId: version._id });
    await this.versionModel.deleteOne({ _id: version._id });
  }

  private async resolveVersion(workspaceId: string, versionUuid: string) {
    const version = await this.versionModel
      .findOne({ workspaceId, uuid: versionUuid })
      .lean()
      .exec();
    if (!version) throw new NotFoundException('Version not found');
    return version;
  }

  /** Lista dokumentów w danej wersji (drzewo czytnika), z filtrem ACL. */
  async listDocs(
    workspaceId: string,
    versionUuid: string,
    access?: AccessChecker,
  ) {
    const version = await this.resolveVersion(workspaceId, versionUuid);
    const files = await this.fileModel
      .find({ versionId: version._id })
      .select('filePath title')
      .sort({ filePath: 1 })
      .lean()
      .exec();
    const visible = access
      ? files.filter((f) => access(f.filePath) !== 'none')
      : files;
    return visible.map((f) => ({ filePath: f.filePath, title: f.title }));
  }

  /** Pojedynczy dokument w danej wersji (do renderu w czytniku), ACL-checked. */
  async getDoc(
    workspaceId: string,
    versionUuid: string,
    filePath: string,
    access?: AccessChecker,
  ) {
    if (access && access(filePath) === 'none') {
      throw new NotFoundException('Document not found');
    }
    const version = await this.resolveVersion(workspaceId, versionUuid);
    const file = await this.fileModel
      .findOne({ versionId: version._id, filePath })
      .lean()
      .exec();
    if (!file)
      throw new NotFoundException('Document not found in this version');
    return {
      filePath: file.filePath,
      title: file.title,
      contentHtml: file.contentHtml,
      contentRaw: file.contentRaw,
      version: version.label,
    };
  }
}
