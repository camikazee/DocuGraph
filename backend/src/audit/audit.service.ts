import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { UserDocument } from '../users/schemas/user.schema';

export interface AuditEntry {
  workspaceId: string;
  actorId?: string | null;
  action: string;
  target?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
  ) {}

  /**
   * Zapisuje wpis audytu. Nigdy nie wywraca głównej akcji — błąd zapisu jest
   * logowany, ale nie propagowany (audyt jest pomocniczy, nie krytyczny).
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.auditModel.create({
        workspaceId: entry.workspaceId,
        actorId: entry.actorId ?? null,
        action: entry.action,
        target: entry.target ?? null,
        metadata: entry.metadata ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Audit log failed for ${entry.action}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Ostatnie wpisy audytu (najnowsze pierwsze); `before` = kursor paginacji. */
  async list(workspaceId: string, limit = 50, before?: string) {
    const filter: Record<string, unknown> = { workspaceId };
    if (before) {
      const cursor = new Date(before);
      if (!isNaN(cursor.getTime())) filter.createdAt = { $lt: cursor };
    }
    const items = await this.auditModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .populate<{ actorId: UserDocument | null }>('actorId', 'name')
      .lean()
      .exec();

    return items.map((a) => {
      const actor = a.actorId as { name?: string } | null;
      return {
        id: a.uuid,
        action: a.action,
        target: a.target,
        actor: actor?.name ?? 'System',
        metadata: a.metadata,
        createdAt: (a as unknown as { createdAt: Date }).createdAt,
      };
    });
  }
}
