import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ErrorLog,
  ErrorLogDocument,
  ErrorSource,
} from './schemas/error-log.schema';
import { UserDocument } from '../users/schemas/user.schema';

export interface ErrorEntry {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  requestId?: string | null;
  userAgent?: string | null;
  workspaceId?: string | null;
  userId?: string | null;
}

const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;

@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);

  constructor(
    @InjectModel(ErrorLog.name)
    private readonly model: Model<ErrorLogDocument>,
  ) {}

  /** Zapis błędu — best-effort; nigdy nie rzuca (dziennik jest pomocniczy). */
  async record(entry: ErrorEntry): Promise<void> {
    try {
      await this.model.create({
        source: entry.source,
        message: (entry.message || 'Unknown error').slice(0, MAX_MESSAGE),
        stack: entry.stack ? entry.stack.slice(0, MAX_STACK) : null,
        method: entry.method ?? null,
        path: entry.path ?? null,
        statusCode: entry.statusCode ?? null,
        requestId: entry.requestId ?? null,
        userAgent: entry.userAgent ? entry.userAgent.slice(0, 400) : null,
        workspaceId:
          entry.workspaceId && Types.ObjectId.isValid(entry.workspaceId)
            ? new Types.ObjectId(entry.workspaceId)
            : null,
        userId:
          entry.userId && Types.ObjectId.isValid(entry.userId)
            ? new Types.ObjectId(entry.userId)
            : null,
      });
    } catch (err) {
      this.logger.error(
        'Failed to persist error log entry',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Lista błędów danego workspace (najnowsze pierwsze), z paginacją kursorem.
   * Sanityzowana — bez `stack` (ten zostaje lokalnie dla operatora).
   */
  async list(
    workspaceId: string,
    opts: { limit?: number; before?: string } = {},
  ) {
    const limit = Math.min(opts.limit ?? 30, 100);
    const filter: Record<string, unknown> = {
      workspaceId: new Types.ObjectId(workspaceId),
    };
    if (opts.before) {
      const cursor = new Date(opts.before);
      if (!isNaN(cursor.getTime())) filter.createdAt = { $lt: cursor };
    }
    const rows = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate<{ userId: UserDocument | null }>('userId', 'name')
      .lean()
      .exec();
    return rows.map((r) => ({
      id: r.uuid,
      source: r.source,
      message: r.message,
      method: r.method,
      path: r.path,
      statusCode: r.statusCode,
      requestId: r.requestId,
      user: r.userId ? (r.userId as unknown as { name: string }).name : null,
      createdAt: (r as unknown as { createdAt: Date }).createdAt,
    }));
  }
}
