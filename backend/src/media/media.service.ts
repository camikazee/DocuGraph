import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { encryptSecret } from '../common/crypto.util';
import {
  DocumentEntity,
  DocumentEntityDocument,
} from '../documents/schemas/document.schema';
import {
  Volume,
  VolumeDocument,
  VolumeProvider,
} from './schemas/volume.schema';
import { Asset, AssetDocument, AssetType } from './schemas/asset.schema';
import { ProviderFactory, SECRET_FIELDS } from './providers/provider.factory';
import { imageSize } from './image-size.util';

const QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const LARGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ASSET_REF_RE =
  /\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
const ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'image/webp',
  'application/pdf',
];

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(Volume.name)
    private readonly volumeModel: Model<VolumeDocument>,
    @InjectModel(Asset.name) private readonly assetModel: Model<AssetDocument>,
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentEntityDocument>,
    private readonly providers: ProviderFactory,
  ) {}

  // ---------------- Volumes ----------------

  private maskVolume(v: VolumeDocument) {
    const config: Record<string, string> = { ...(v.config ?? {}) };
    for (const f of SECRET_FIELDS) if (config[f]) config[f] = '••••••••';
    return {
      id: v.uuid,
      name: v.name,
      provider: v.provider,
      status: v.status,
      lastConnectedAt: v.lastConnectedAt,
      storageUsed: v.storageUsed,
      config,
    };
  }

  private encryptConfig(raw: Record<string, unknown>): Record<string, string> {
    const config: Record<string, string> = {};
    for (const [k, val] of Object.entries(raw ?? {})) {
      if (val === undefined || val === null || val === '') continue;
      config[k] = SECRET_FIELDS.includes(k)
        ? encryptSecret(String(val))
        : String(val);
    }
    return config;
  }

  private async getVolume(
    workspaceId: string,
    uuid: string,
  ): Promise<VolumeDocument> {
    const v = await this.volumeModel.findOne({ workspaceId, uuid }).exec();
    if (!v) throw new NotFoundException('Volume not found');
    return v;
  }

  /** Domyślny lokalny wolumen — tworzony przy pierwszym użyciu, by manager działał od razu. */
  private async ensureDefaultVolume(
    workspaceId: string,
  ): Promise<VolumeDocument> {
    const existing = await this.volumeModel
      .findOne({ workspaceId })
      .sort({ createdAt: 1 })
      .exec();
    if (existing) return existing;
    return this.volumeModel.create({
      workspaceId,
      name: 'Local storage',
      provider: 'local',
      config: {},
      status: 'connected',
    });
  }

  async listVolumes(workspaceId: string) {
    await this.ensureDefaultVolume(workspaceId);
    const vs = await this.volumeModel
      .find({ workspaceId })
      .sort({ createdAt: 1 })
      .exec();
    return vs.map((v) => this.maskVolume(v));
  }

  async createVolume(
    workspaceId: string,
    createdBy: string | null,
    dto: {
      name: string;
      provider: VolumeProvider;
      config?: Record<string, unknown>;
    },
  ) {
    const v = await this.volumeModel.create({
      workspaceId,
      name: dto.name,
      provider: dto.provider,
      config: this.encryptConfig(dto.config ?? {}),
      createdBy: createdBy || null,
    });
    const test = await this.providers.for(v).testConnection();
    v.status = test.ok ? 'connected' : 'error';
    if (test.ok) v.lastConnectedAt = new Date();
    await v.save();
    return { ...this.maskVolume(v), test };
  }

  /** Test poświadczeń bez zapisu wolumenu (kreator „Test connection"). */
  async testConfig(dto: {
    provider: VolumeProvider;
    config?: Record<string, unknown>;
  }) {
    const probe = new this.volumeModel({
      workspaceId: undefined,
      name: 'probe',
      provider: dto.provider,
      config: this.encryptConfig(dto.config ?? {}),
    });
    return this.providers.for(probe).testConnection();
  }

  async testVolume(workspaceId: string, uuid: string) {
    const v = await this.getVolume(workspaceId, uuid);
    const test = await this.providers.for(v).testConnection();
    v.status = test.ok ? 'connected' : 'error';
    if (test.ok) v.lastConnectedAt = new Date();
    await v.save();
    return test;
  }

  async deleteVolume(workspaceId: string, uuid: string) {
    const v = await this.getVolume(workspaceId, uuid);
    const assets = await this.assetModel
      .find({ workspaceId, volumeId: v._id })
      .exec();
    const provider = this.providers.for(v);
    for (const a of assets) {
      try {
        await provider.delete(a.path);
      } catch {
        // ignorujemy błędy usuwania bajtów (np. driver niewłączony)
      }
    }
    await this.assetModel.deleteMany({ volumeId: v._id });
    await this.volumeModel.deleteOne({ _id: v._id });
    return { deleted: true };
  }

  // ---------------- Assets ----------------

  private typeOf(mime: string): AssetType {
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('text/')) return 'doc';
    return 'other';
  }

  private async bumpUsage(v: VolumeDocument, delta: number) {
    await this.volumeModel.updateOne(
      { _id: v._id },
      { $inc: { storageUsed: delta } },
    );
  }

  /** Mapa assetUuid → ścieżki dokumentów, w których jest użyty. */
  private async referenceMap(
    workspaceId: string,
  ): Promise<Map<string, string[]>> {
    const docs = await this.documentModel
      .find({ workspaceId })
      .select('filePath contentRaw')
      .exec();
    const map = new Map<string, string[]>();
    for (const d of docs) {
      const seen = new Set<string>();
      for (const m of (d.contentRaw ?? '').matchAll(ASSET_REF_RE)) {
        const id = m[1].toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        (map.get(id) ?? map.set(id, []).get(id)!).push(d.filePath);
      }
    }
    return map;
  }

  async upload(
    workspaceId: string,
    uploadedBy: string | null,
    volumeUuid: string | undefined,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }
    const v = volumeUuid
      ? await this.getVolume(workspaceId, volumeUuid)
      : await this.ensureDefaultVolume(workspaceId);

    const assetUuid = randomUUID();
    const safeName =
      path.basename(file.originalname).replace(/[^\w.\-]+/g, '-') || 'file';
    const storedPath = `${assetUuid}-${safeName}`;

    // bajty -> provider (s3/ftp rzuci 501; indeks tworzymy dopiero po sukcesie)
    await this.providers.for(v).put(storedPath, file.buffer, file.mimetype);

    const dim = file.mimetype.startsWith('image/')
      ? imageSize(file.buffer)
      : null;
    const asset = await this.assetModel.create({
      uuid: assetUuid,
      workspaceId,
      volumeId: v._id,
      name: safeName,
      path: storedPath,
      mimeType: file.mimetype,
      type: this.typeOf(file.mimetype),
      size: file.size,
      width: dim?.width ?? null,
      height: dim?.height ?? null,
      uploadedBy: uploadedBy || null,
    });
    await this.bumpUsage(v, file.size);
    return this.toAsset(asset, v.uuid, []);
  }

  private toAsset(
    a: AssetDocument,
    volumeUuid: string,
    referencedIn: string[],
  ) {
    return {
      id: a.uuid,
      name: a.name,
      type: a.type,
      mimeType: a.mimeType,
      size: a.size,
      width: a.width,
      height: a.height,
      volumeId: volumeUuid,
      referencedIn,
      createdAt: a.get('createdAt') as Date,
    };
  }

  async listAssets(workspaceId: string, filter?: string) {
    const [assets, refs, volumes] = await Promise.all([
      this.assetModel.find({ workspaceId }).sort({ createdAt: -1 }).exec(),
      this.referenceMap(workspaceId),
      this.volumeModel.find({ workspaceId }).select('uuid').exec(),
    ]);
    const volUuid = new Map(volumes.map((v) => [v._id.toString(), v.uuid]));
    let out = assets.map((a) =>
      this.toAsset(
        a,
        volUuid.get(a.volumeId.toString()) ?? '',
        refs.get(a.uuid.toLowerCase()) ?? [],
      ),
    );
    if (filter === 'image') out = out.filter((a) => a.type === 'image');
    else if (filter === 'pdf') out = out.filter((a) => a.type === 'pdf');
    else if (filter === 'large') out = out.filter((a) => a.size > LARGE_BYTES);
    else if (filter === 'unused')
      out = out.filter((a) => a.referencedIn.length === 0);
    return out;
  }

  async overview(workspaceId: string) {
    const [assets, refs] = await Promise.all([
      this.assetModel.find({ workspaceId }).select('uuid type size').exec(),
      this.referenceMap(workspaceId),
    ]);
    const indexed = new Set(assets.map((a) => a.uuid.toLowerCase()));
    const brokenLinks = [...refs.keys()].filter(
      (id) => !indexed.has(id),
    ).length;
    const used = assets.reduce((s, a) => s + a.size, 0);
    return {
      usedBytes: used,
      quotaBytes: QUOTA_BYTES,
      counts: {
        total: assets.length,
        images: assets.filter((a) => a.type === 'image').length,
        pdf: assets.filter((a) => a.type === 'pdf').length,
        large: assets.filter((a) => a.size > LARGE_BYTES).length,
        unused: assets.filter((a) => !refs.has(a.uuid.toLowerCase())).length,
      },
      brokenLinks,
    };
  }

  /** Zwraca bajty assetu (provider) + metadane do nagłówków. */
  async serve(
    workspaceId: string,
    assetUuid: string,
  ): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
    const a = await this.assetModel
      .findOne({ workspaceId, uuid: assetUuid })
      .exec();
    if (!a) throw new NotFoundException('Asset not found');
    const v = await this.volumeModel.findById(a.volumeId).exec();
    if (!v) throw new NotFoundException('Volume not found');
    const buffer = await this.providers.for(v).get(a.path); // s3/ftp -> 501
    return { buffer, mimeType: a.mimeType, name: a.name };
  }

  async rename(workspaceId: string, assetUuid: string, name: string) {
    const a = await this.assetModel
      .findOne({ workspaceId, uuid: assetUuid })
      .exec();
    if (!a) throw new NotFoundException('Asset not found');
    a.name = path.basename(name).replace(/[^\w.\-]+/g, '-') || a.name;
    await a.save();
    const v = await this.volumeModel.findById(a.volumeId).select('uuid').exec();
    const refs = await this.referenceMap(workspaceId);
    return this.toAsset(a, v?.uuid ?? '', refs.get(a.uuid.toLowerCase()) ?? []);
  }

  /**
   * Przenosi asset na inny wolumen: czyta bajty przez provider źródła, zapisuje
   * przez provider celu, kasuje ze źródła (best-effort) i przepina indeks.
   * Dowodzi wymienności wolumenów — ten sam efekt niezależnie od backendu.
   */
  async move(workspaceId: string, assetUuid: string, targetVolumeUuid: string) {
    const a = await this.assetModel
      .findOne({ workspaceId, uuid: assetUuid })
      .exec();
    if (!a) throw new NotFoundException('Asset not found');

    const source = await this.volumeModel.findById(a.volumeId).exec();
    if (!source) throw new NotFoundException('Source volume not found');

    const target = await this.getVolume(workspaceId, targetVolumeUuid);

    const refs = await this.referenceMap(workspaceId);
    const refList = refs.get(a.uuid.toLowerCase()) ?? [];

    // Już na tym wolumenie — nic nie przenosimy.
    if (target._id.equals(source._id)) {
      return this.toAsset(a, source.uuid, refList);
    }

    const srcProvider = this.providers.for(source);
    const dstProvider = this.providers.for(target);

    let buffer: Buffer;
    try {
      buffer = await srcProvider.get(a.path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'read failed';
      throw new BadRequestException(`Could not read from ${source.name}: ${msg}`);
    }

    // Klucz (a.path = uuid-name) jest globalnie unikalny — brak kolizji na celu.
    // Zapis na cel PRZED usunięciem ze źródła — gdy cel padnie, źródło zostaje
    // nietknięte (brak utraty danych), a my zwracamy czytelny błąd zamiast 500.
    try {
      await dstProvider.put(a.path, buffer, a.mimeType);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'write failed';
      throw new BadRequestException(`Could not write to ${target.name}: ${msg}`);
    }
    try {
      await srcProvider.delete(a.path);
    } catch {
      // źródło może być niewłączone/niedostępne — kopia na celu już jest
    }

    await this.bumpUsage(source, -a.size);
    await this.bumpUsage(target, a.size);
    a.volumeId = target._id;
    await a.save();

    return this.toAsset(a, target.uuid, refList);
  }

  async remove(workspaceId: string, assetUuid: string) {
    const a = await this.assetModel
      .findOne({ workspaceId, uuid: assetUuid })
      .exec();
    if (!a) throw new NotFoundException('Asset not found');
    const v = await this.volumeModel.findById(a.volumeId).exec();
    if (v) {
      try {
        await this.providers.for(v).delete(a.path);
      } catch {
        // driver może być niewłączony — usuwamy wpis indeksu mimo to
      }
      await this.bumpUsage(v, -a.size);
    }
    await this.assetModel.deleteOne({ _id: a._id });
    return { deleted: true };
  }
}
