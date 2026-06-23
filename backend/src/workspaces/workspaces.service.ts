import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { encryptSecret, decryptSecret } from '../common/crypto.util';
import { Role } from '../common/enums/role.enum';
import { slugify, randomSlugSuffix } from '../common/utils/slug.util';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Workspace, WorkspaceDocument } from './schemas/workspace.schema';
import { Membership, MembershipDocument } from './schemas/membership.schema';

export interface WorkspaceWithRole {
  workspace: WorkspaceDocument;
  role: Role;
}

export interface WorkspaceMember {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
}

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Tworzy workspace i nadaje twórcy rolę Owner.
   *
   * Uwaga: na klastrze z replica set warto opakować obie operacje w transakcję.
   * Lokalny standalone MongoDB nie wspiera transakcji, więc tworzymy sekwencyjnie.
   */
  async createWithOwner(
    ownerId: Types.ObjectId,
    name: string,
  ): Promise<WorkspaceDocument> {
    const slug = await this.generateUniqueSlug(name);
    const workspace = await this.workspaceModel.create({
      name,
      slug,
      ownerId,
    });
    await this.membershipModel.create({
      workspaceId: workspace._id,
      userId: ownerId,
      role: Role.Owner,
    });
    return workspace;
  }

  /** Tworzy workspace dla zalogowanego usera (po jego id w postaci string). */
  createForUser(userId: string, name: string): Promise<WorkspaceDocument> {
    return this.createWithOwner(new Types.ObjectId(userId), name);
  }

  /** Lista workspace'ów, do których należy user, wraz z jego rolą. */
  async listForUser(userId: Types.ObjectId): Promise<WorkspaceWithRole[]> {
    const memberships = await this.membershipModel
      .find({ userId })
      .populate<{ workspaceId: WorkspaceDocument }>('workspaceId')
      .exec();

    return memberships
      .filter((m) => m.workspaceId)
      .map((m) => ({
        workspace: m.workspaceId as unknown as WorkspaceDocument,
        role: m.role,
      }));
  }

  /** Członkostwo danego usera w danym workspace (lub null). */
  findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<MembershipDocument | null> {
    return this.membershipModel.findOne({ workspaceId, userId }).exec();
  }

  /** Publiczny uuid workspace → wewnętrzne _id (string), lub null. */
  async resolveId(uuid: string): Promise<string | null> {
    const ws = await this.workspaceModel.findOne({ uuid }).select('_id').exec();
    return ws ? ws._id.toString() : null;
  }

  /** Wewnętrzne _id → publiczny uuid, lub null. */
  async getUuid(internalId: string): Promise<string | null> {
    const ws = await this.workspaceModel
      .findById(internalId)
      .select('uuid')
      .exec();
    return ws ? ws.uuid : null;
  }

  /**
   * Dodaje członka do workspace. Jeśli już jest członkiem — zwraca istniejące
   * członkostwo (idempotentne, używane przy akceptacji zaproszenia).
   */
  async addMember(
    workspaceId: string,
    userId: string,
    role: Role,
  ): Promise<MembershipDocument> {
    const existing = await this.findMembership(workspaceId, userId);
    if (existing) {
      return existing;
    }
    return this.membershipModel.create({ workspaceId, userId, role });
  }

  /** Lista członków workspace wraz z danymi użytkowników. */
  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const memberships = await this.membershipModel
      .find({ workspaceId })
      .populate<{
        userId: UserDocument | null;
      }>('userId', 'uuid email name avatarUrl')
      .exec();

    return memberships
      .filter((m) => m.userId)
      .map((m) => {
        const u = m.userId as UserDocument;
        return {
          userId: u.uuid,
          email: u.email,
          name: u.name,
          avatarUrl: u.avatarUrl,
          role: m.role,
        };
      });
  }

  /** Publiczny uuid usera → wewnętrzne _id (string), lub null. */
  async resolveUserId(uuid: string): Promise<string | null> {
    const u = await this.userModel.findOne({ uuid }).select('_id').exec();
    return u ? u._id.toString() : null;
  }

  /** Zmiana roli członka. Nie pozwala zdegradować ostatniego właściciela. */
  async changeMemberRole(
    workspaceId: string,
    targetUserUuid: string,
    role: Role,
  ): Promise<void> {
    const targetUserId = await this.resolveUserId(targetUserUuid);
    const membership = targetUserId
      ? await this.findMembership(workspaceId, targetUserId)
      : null;
    if (!membership) {
      throw new NotFoundException('Member not found in this workspace');
    }
    if (membership.role === Role.Owner && role !== Role.Owner) {
      await this.assertNotLastOwner(workspaceId);
    }
    await this.membershipModel.updateOne(
      { _id: membership._id },
      { $set: { role } },
    );
  }

  /** Usunięcie członka. Nie pozwala usunąć ostatniego właściciela. */
  async removeMember(
    workspaceId: string,
    targetUserUuid: string,
  ): Promise<void> {
    const targetUserId = await this.resolveUserId(targetUserUuid);
    const membership = targetUserId
      ? await this.findMembership(workspaceId, targetUserId)
      : null;
    if (!membership) {
      throw new NotFoundException('Member not found in this workspace');
    }
    if (membership.role === Role.Owner) {
      await this.assertNotLastOwner(workspaceId);
    }
    await this.membershipModel.deleteOne({ _id: membership._id });
  }

  private async assertNotLastOwner(workspaceId: string): Promise<void> {
    const owners = await this.membershipModel.countDocuments({
      workspaceId,
      role: Role.Owner,
    });
    if (owners <= 1) {
      throw new BadRequestException(
        'Cannot remove or demote the last owner of the workspace',
      );
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    // W praktyce kolizje są rzadkie; dokładamy losowy sufiks aż do unikalności.
    while (await this.workspaceModel.exists({ slug: candidate })) {
      candidate = `${base}-${randomSlugSuffix()}`;
    }
    return candidate;
  }

  // ---- Źródło dokumentacji (Git) — Moduł F ----

  /**
   * Konfiguracja źródła — bez sekretów (webhookSecret, pushRemote). Zamiast
   * surowego pushRemote wystawiamy flagę `pushConfigured`.
   */
  async getSource(workspaceId: string) {
    const w = await this.workspaceModel
      .findById(workspaceId)
      .select('source')
      .lean()
      .exec();
    const s = w?.source as
      | {
          provider?: string | null;
          repo?: string | null;
          branch?: string;
          root?: string;
          realtimeWebhooks?: boolean;
          bidirectional?: boolean;
          enforceTemplates?: boolean;
          lastIndexedAt?: Date | null;
          pushRemote?: string | null;
        }
      | undefined;
    if (!s) return null;
    return {
      provider: s.provider ?? null,
      repo: s.repo ?? null,
      branch: s.branch ?? 'main',
      root: s.root ?? '',
      realtimeWebhooks: !!s.realtimeWebhooks,
      bidirectional: !!s.bidirectional,
      enforceTemplates: !!s.enforceTemplates,
      lastIndexedAt: s.lastIndexedAt ?? null,
      // Sekrety (webhookSecret, pushRemote) nigdy nie wracają — tylko flaga.
      pushConfigured: !!s.pushRemote,
    };
  }

  async setSource(
    workspaceId: string,
    dto: Partial<{
      provider: string;
      repo: string;
      branch: string;
      root: string;
      realtimeWebhooks: boolean;
      bidirectional: boolean;
      enforceTemplates: boolean;
      pushRemote: string;
    }>,
  ) {
    // Aktualizacja per-pole (zachowuje webhookSecret i lastIndexedAt).
    const set: Record<string, unknown> = {};
    for (const key of [
      'provider',
      'repo',
      'branch',
      'root',
      'realtimeWebhooks',
      'bidirectional',
      'enforceTemplates',
    ] as const) {
      if (dto[key] !== undefined) set[`source.${key}`] = dto[key];
    }

    // pushRemote bywa wrażliwy (token w URL) — szyfrujemy; pusty = wyczyść.
    if (dto.pushRemote !== undefined) {
      set['source.pushRemote'] = dto.pushRemote
        ? encryptSecret(dto.pushRemote)
        : null;
    }

    // Po włączeniu webhooków generujemy sekret HMAC (raz; nie nadpisujemy).
    if (dto.realtimeWebhooks) {
      const secret = await this.getWebhookSecret(workspaceId);
      if (!secret) set['source.webhookSecret'] = randomBytes(24).toString('hex');
    }

    if (Object.keys(set).length) {
      await this.workspaceModel.updateOne({ _id: workspaceId }, { $set: set });
    }
    return this.getSource(workspaceId);
  }

  /** Odszyfrowany remote do publikacji (commit & push) — użycie wewnętrzne. */
  async getPushRemote(workspaceId: string): Promise<string | null> {
    const w = await this.workspaceModel
      .findById(workspaceId)
      .select('source.pushRemote')
      .lean()
      .exec();
    const enc = (w?.source as { pushRemote?: string } | undefined)?.pushRemote;
    return enc ? decryptSecret(enc) : null;
  }

  /** Sekret HMAC webhooka (do weryfikacji sygnatur) — użycie wewnętrzne. */
  async getWebhookSecret(workspaceId: string): Promise<string | null> {
    const w = await this.workspaceModel
      .findById(workspaceId)
      .select('source.webhookSecret')
      .lean()
      .exec();
    return (w?.source as { webhookSecret?: string } | undefined)?.webhookSecret ?? null;
  }

  /** Konfiguracja webhooka dla właściciela (URL składa frontend z apiBaseUrl). */
  async getWebhookConfig(workspaceId: string) {
    const w = await this.workspaceModel
      .findById(workspaceId)
      .select('source uuid')
      .lean()
      .exec();
    const source = w?.source as
      | { realtimeWebhooks?: boolean; webhookSecret?: string }
      | undefined;
    return {
      enabled: !!source?.realtimeWebhooks,
      secret: source?.webhookSecret ?? null,
      path: w?.uuid ? `/workspaces/${w.uuid}/hooks/github` : null,
    };
  }

  async markIndexed(workspaceId: string) {
    await this.workspaceModel.updateOne(
      { _id: workspaceId },
      { $set: { 'source.lastIndexedAt': new Date() } },
    );
  }
}
