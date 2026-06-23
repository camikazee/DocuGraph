import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { generateToken, hashToken } from '../common/utils/token.util';
import { ApiKey, ApiKeyDocument } from './schemas/api-key.schema';

const API_KEY_PREFIX = 'dg_live_';

export interface CreatedApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  /** Surowy token — zwracany TYLKO przy utworzeniu. */
  token: string;
}

export interface MaskedApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyContext {
  workspaceId: string; // wewnętrzne _id (do zapytań)
  workspaceUuid: string; // publiczny uuid (do zwracania na zewnątrz)
  apiKeyId: string;
}

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectModel(ApiKey.name)
    private readonly apiKeyModel: Model<ApiKeyDocument>,
  ) {}

  async create(
    workspaceId: string,
    createdBy: string,
    name: string,
  ): Promise<CreatedApiKey> {
    const { raw, hash } = generateToken(API_KEY_PREFIX);
    // Maska do wyświetlania: dg_live_••••<ostatnie 4 znaki>.
    const keyPrefix = `${API_KEY_PREFIX}••••${raw.slice(-4)}`;

    const apiKey = await this.apiKeyModel.create({
      workspaceId,
      name,
      keyHash: hash,
      keyPrefix,
      createdBy,
    });

    return {
      id: apiKey.uuid,
      name: apiKey.name,
      keyPrefix,
      token: raw,
    };
  }

  async list(workspaceId: string): Promise<MaskedApiKey[]> {
    const keys = await this.apiKeyModel
      .find({ workspaceId })
      .sort({ createdAt: -1 })
      .exec();

    return keys.map((k) => ({
      id: k.uuid,
      name: k.name,
      keyPrefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
      createdAt: k.get('createdAt') as Date,
    }));
  }

  async revoke(workspaceId: string, keyUuid: string): Promise<void> {
    await this.apiKeyModel.updateOne(
      { uuid: keyUuid, workspaceId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  /**
   * Waliduje surowy token CI/CD. Rzuca 401, gdy nieznany lub odwołany.
   * Aktualizuje lastUsedAt i zwraca kontekst workspace.
   */
  async validate(rawToken: string): Promise<ApiKeyContext> {
    const apiKey = await this.apiKeyModel
      .findOne({ keyHash: hashToken(rawToken) })
      .populate<{
        workspaceId: { _id: Types.ObjectId; uuid: string };
      }>('workspaceId', 'uuid');
    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }
    await this.apiKeyModel.updateOne(
      { _id: apiKey._id },
      { lastUsedAt: new Date() },
    );

    const ws = apiKey.workspaceId;
    return {
      workspaceId: ws._id.toString(),
      workspaceUuid: ws.uuid,
      apiKeyId: apiKey._id.toString(),
    };
  }
}
