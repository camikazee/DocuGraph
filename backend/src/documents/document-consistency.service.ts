import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DocumentEntity,
  DocumentEntityDocument,
} from './schemas/document.schema';
import { WorkspaceStorageService } from './workspace-storage.service';

export interface DocumentConsistencyReport {
  ok: boolean;
  missingOnDisk: string[];
  missingInIndex: string[];
  contentMismatch: string[];
}

@Injectable()
export class DocumentConsistencyService {
  constructor(
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentEntityDocument>,
    private readonly storage: WorkspaceStorageService,
  ) {}

  async check(workspaceId: string): Promise<DocumentConsistencyReport> {
    const [indexed, diskPaths] = await Promise.all([
      this.documentModel
        .find({ workspaceId })
        .select('filePath contentRaw')
        .lean()
        .exec(),
      this.storage.listFiles(workspaceId),
    ]);
    const indexedByPath = new Map(
      indexed.map((doc) => [doc.filePath, doc.contentRaw]),
    );
    const diskSet = new Set(diskPaths);
    const missingOnDisk = [...indexedByPath.keys()]
      .filter((filePath) => !diskSet.has(filePath))
      .sort();
    const missingInIndex = diskPaths
      .filter((filePath) => !indexedByPath.has(filePath))
      .sort();
    const contentMismatch: string[] = [];

    for (const filePath of diskPaths) {
      const indexedContent = indexedByPath.get(filePath);
      if (indexedContent === undefined) continue;
      const diskContent = await this.storage.readFile(workspaceId, filePath);
      if (diskContent !== indexedContent) contentMismatch.push(filePath);
    }

    return {
      ok:
        missingOnDisk.length === 0 &&
        missingInIndex.length === 0 &&
        contentMismatch.length === 0,
      missingOnDisk,
      missingInIndex,
      contentMismatch: contentMismatch.sort(),
    };
  }
}
