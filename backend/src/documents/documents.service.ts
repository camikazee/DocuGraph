import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as path from 'path';
import { MarkdownParserService } from './markdown-parser.service';
import { WorkspaceStorageService } from './workspace-storage.service';
import {
  DocumentEntity,
  DocumentEntityDocument,
} from './schemas/document.schema';
import { Revision, RevisionDocument } from './schemas/revision.schema';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { Event, EventDocument } from './schemas/event.schema';
import { Watch, WatchDocument } from './schemas/watch.schema';
import { Favorite, FavoriteDocument } from './schemas/favorite.schema';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../common/mailer/mailer.service';
import { UsersService } from '../users/users.service';
import { NotificationPreferencesService } from '../notification-preferences/notification-preferences.service';
import { MediaService } from '../media/media.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { lineDiff } from './diff.util';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentEntityDocument>,
    @InjectModel(Revision.name)
    private readonly revisionModel: Model<RevisionDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Event.name)
    private readonly eventModel: Model<EventDocument>,
    @InjectModel(Watch.name)
    private readonly watchModel: Model<WatchDocument>,
    @InjectModel(Favorite.name)
    private readonly favoriteModel: Model<FavoriteDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly storage: WorkspaceStorageService,
    private readonly parser: MarkdownParserService,
    private readonly mailer: MailerService,
    private readonly usersService: UsersService,
    private readonly preferences: NotificationPreferencesService,
    private readonly config: ConfigService,
    private readonly media: MediaService,
    private readonly workspaces: WorkspacesService,
  ) {}

  // --- Cache w pamięci dla drogich obliczeń per-workspace (graf, health). ---
  // TTL zabezpiecza przed nieświeżością; mutacje dokumentów jawnie unieważniają.
  private readonly computeCache = new Map<
    string,
    { at: number; data: unknown }
  >();
  private readonly CACHE_TTL_MS = 30_000;

  private cacheGet<T>(key: string): T | null {
    const e = this.computeCache.get(key);
    if (e && Date.now() - e.at < this.CACHE_TTL_MS) return e.data as T;
    return null;
  }
  private cacheSet(key: string, data: unknown): void {
    this.computeCache.set(key, { at: Date.now(), data });
  }
  private invalidateWorkspace(workspaceId: string): void {
    for (const k of this.computeCache.keys()) {
      if (k.endsWith(`:${workspaceId}`)) this.computeCache.delete(k);
    }
  }

  /**
   * Zamienia `<img src=".../assets/<uuid>">` na osadzone data-URI (base64),
   * aby eksport był samowystarczalny (bez zależności od działającego API).
   * Assety nieczytelne (np. wolumen offline) zostają z oryginalnym src.
   */
  private async embedImages(
    html: string,
    workspaceId: string,
  ): Promise<string> {
    const re = /src="([^"]*\/assets\/([0-9a-fA-F-]{36})[^"]*)"/g;
    const uuids = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) uuids.add(m[2]);
    if (uuids.size === 0) return html;

    const dataUri = new Map<string, string>();
    for (const uuid of uuids) {
      try {
        const { buffer, mimeType } = await this.media.serve(workspaceId, uuid);
        dataUri.set(
          uuid,
          `data:${mimeType};base64,${buffer.toString('base64')}`,
        );
      } catch {
        /* asset unreadable — keep the original src */
      }
    }
    return html.replace(re, (full, _src: string, uuid: string) => {
      const data = dataUri.get(uuid);
      return data ? `src="${data}"` : full;
    });
  }

  // ---- Telemetria: odczyty + obserwacje ----

  /** Rejestruje odczyt dokumentu (z czasem dwell). */
  async recordRead(
    workspaceId: string,
    filePath: string,
    userId: string | null,
    durationMs: number,
  ): Promise<void> {
    await this.eventModel.create({
      workspaceId,
      filePath,
      kind: 'read',
      userId,
      durationMs: Math.max(0, Math.min(durationMs || 0, 3_600_000)),
    });
  }

  /**
   * Ostatnio przeglądane przez usera dokumenty (historia przeglądania) —
   * z eventów `read`, zdeduplikowane po pliku (najnowszy odczyt), z tytułem.
   * Pomija dokumenty, które już nie istnieją.
   */
  async recentlyViewed(workspaceId: string, userId: string, limit = 15) {
    const rows = await this.eventModel.aggregate<{
      _id: string;
      viewedAt: Date;
    }>([
      {
        $match: {
          workspaceId: new Types.ObjectId(workspaceId),
          userId: new Types.ObjectId(userId),
          kind: 'read',
        },
      },
      { $group: { _id: '$filePath', viewedAt: { $max: '$createdAt' } } },
      { $sort: { viewedAt: -1 } },
      { $limit: Math.min(limit, 50) },
    ]);
    if (rows.length === 0) return [];
    const paths = rows.map((r) => r._id);
    const docs = await this.documentModel
      .find({ workspaceId, filePath: { $in: paths } })
      .select('filePath title')
      .lean()
      .exec();
    const titleByPath = new Map(docs.map((d) => [d.filePath, d.title]));
    return rows
      .filter((r) => titleByPath.has(r._id))
      .map((r) => ({
        filePath: r._id,
        title: titleByPath.get(r._id) ?? r._id,
        viewedAt: r.viewedAt,
      }));
  }

  /** Ścieżki obserwowane przez usera w workspace. */
  async listWatching(workspaceId: string, userId: string): Promise<string[]> {
    const ws = await this.watchModel
      .find({ workspaceId, userId })
      .select('filePath')
      .exec();
    return ws.map((w) => w.filePath);
  }

  /** Ustawia/zdejmuje obserwację dokumentu; zwraca aktualną listę. */
  async setWatch(
    workspaceId: string,
    userId: string,
    filePath: string,
    on: boolean,
  ): Promise<string[]> {
    if (on) {
      await this.watchModel.updateOne(
        { workspaceId, userId, filePath },
        { $setOnInsert: { workspaceId, userId, filePath } },
        { upsert: true },
      );
    } else {
      await this.watchModel.deleteOne({ workspaceId, userId, filePath });
    }
    return this.listWatching(workspaceId, userId);
  }

  // ---- Ulubione (zakładki) ----

  /** Ścieżki dodane do ulubionych przez usera w workspace. */
  async listFavorites(workspaceId: string, userId: string): Promise<string[]> {
    const favs = await this.favoriteModel
      .find({ workspaceId, userId })
      .select('filePath')
      .exec();
    return favs.map((f) => f.filePath);
  }

  /** Dodaje/usuwa ulubiony dokument; zwraca aktualną listę. */
  async setFavorite(
    workspaceId: string,
    userId: string,
    filePath: string,
    on: boolean,
  ): Promise<string[]> {
    if (on) {
      await this.favoriteModel.updateOne(
        { workspaceId, userId, filePath },
        { $setOnInsert: { workspaceId, userId, filePath } },
        { upsert: true },
      );
    } else {
      await this.favoriteModel.deleteOne({ workspaceId, userId, filePath });
    }
    return this.listFavorites(workspaceId, userId);
  }

  // ---- Review / komentarze ----

  async listComments(workspaceId: string, filePath: string) {
    const comments = await this.commentModel
      .find({ workspaceId, filePath })
      .sort({ createdAt: 1 })
      .populate<{ author: UserDocument | null }>('author', 'name')
      .exec();
    return comments.map((c) => ({
      id: c.uuid,
      line: c.line,
      quote: c.quote,
      body: c.body,
      resolved: c.resolved,
      author: c.author ? c.author.name : 'Unknown',
      createdAt: c.get('createdAt') as Date,
    }));
  }

  async addComment(
    workspaceId: string,
    filePath: string,
    line: number,
    quote: string,
    body: string,
    author: string | null,
    mentionUserIds: string[] = [],
  ) {
    await this.commentModel.create({
      workspaceId,
      filePath,
      line,
      quote,
      body,
      author,
      resolved: false,
    });
    const doc = await this.documentModel
      .findOne({ workspaceId, filePath })
      .select('title')
      .lean()
      .exec();
    const title = doc?.title || filePath;

    // Wzmiankowani dostają silniejsze powiadomienie 'mention' — i są wyłączeni
    // z powiadomienia 'comment' dla obserwujących, by nie dublować.
    const mentions = new Set(mentionUserIds.filter((id) => id !== author));
    await this.notifyWatchers(
      workspaceId,
      filePath,
      title,
      author,
      'comment',
      mentions,
    );
    if (mentions.size > 0) {
      await this.notifyUserIds(
        workspaceId,
        filePath,
        title,
        [...mentions].map((id) => new Types.ObjectId(id)),
        'mention',
        author,
      );
    }
    return this.listComments(workspaceId, filePath);
  }

  async setThreadResolved(
    workspaceId: string,
    filePath: string,
    line: number,
    resolved: boolean,
  ) {
    await this.commentModel.updateMany(
      { workspaceId, filePath, line },
      { $set: { resolved } },
    );
    return this.listComments(workspaceId, filePath);
  }

  /**
   * Dwufazowy zapis: 1) plik .md na dysk, 2) parse + upsert mirrora w Mongo.
   * `links.incoming` jest zachowywane (backlinki liczy Moduł C).
   */
  async upsert(
    workspaceId: string,
    filePath: string,
    contentRaw: string,
    updatedBy: string | null,
    message?: string | null,
  ): Promise<DocumentEntityDocument> {
    // Faza 1 — dysk (źródło prawdy). resolveSafePath waliduje ścieżkę.
    await this.storage.writeFile(workspaceId, filePath, contentRaw);

    // Faza 2 — parse + upsert mirrora.
    const parsed = this.parser.parse(contentRaw, filePath);

    const doc = await this.documentModel.findOneAndUpdate(
      { workspaceId, filePath },
      {
        $set: {
          title: parsed.title,
          contentRaw,
          contentHtml: parsed.html,
          metadata: parsed.metadata,
          'links.outgoing': parsed.outgoingLinks,
          updatedBy,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await this.reconcileBacklinks(workspaceId, filePath, parsed.outgoingLinks);
    this.invalidateWorkspace(workspaceId); // graf/health mogły się zmienić

    // Snapshot do historii — tylko gdy treść faktycznie się zmieniła.
    const latest = await this.revisionModel
      .findOne({ workspaceId, filePath })
      .sort({ createdAt: -1 })
      .select('contentRaw')
      .exec();
    if (!latest || latest.contentRaw !== contentRaw) {
      await this.revisionModel.create({
        workspaceId,
        filePath,
        title: parsed.title,
        contentRaw,
        updatedBy,
        message: message?.trim() ? message.trim() : null,
      });
      // Powiadom obserwujących — tylko o realnej zmianie istniejącego dokumentu
      // (nie o jego pierwszym utworzeniu) i nie autora tej zmiany.
      if (latest) {
        await this.notifyWatchers(
          workspaceId,
          filePath,
          parsed.title,
          updatedBy,
        );
      }
    }
    return doc;
  }

  /** Tworzy powiadomienia dla obserwujących dokument (poza autorem zdarzenia). */
  private async notifyWatchers(
    workspaceId: string,
    filePath: string,
    title: string,
    actorId: string | null,
    kind = 'changed',
    exclude: Set<string> = new Set(),
  ): Promise<void> {
    const watchers = await this.watchModel
      .find({ workspaceId, filePath })
      .select('userId')
      .lean()
      .exec();
    await this.notifyUserIds(
      workspaceId,
      filePath,
      title,
      watchers.map((w) => w.userId),
      kind,
      actorId,
      exclude,
    );
  }

  /** In-app + e-mail dla wskazanych odbiorców (poza autorem i `exclude`). */
  private async notifyUserIds(
    workspaceId: string,
    filePath: string,
    title: string,
    recipients: Types.ObjectId[],
    kind: string,
    actorId: string | null,
    exclude: Set<string> = new Set(),
  ): Promise<void> {
    let filtered = recipients.filter((uid) => {
      const s = uid.toString();
      return s !== actorId && !exclude.has(s);
    });
    if (filtered.length === 0) return;
    // Uszanuj wyciszenia per-typ (mentions zawsze docierają).
    if (kind !== 'mention') {
      const allowed = await this.preferences.notMutingKind(
        filtered.map((u) => u.toString()),
        kind,
      );
      filtered = filtered.filter((u) => allowed.has(u.toString()));
      if (filtered.length === 0) return;
    }
    await this.notificationModel.insertMany(
      filtered.map((userId) => ({
        workspaceId,
        userId,
        filePath,
        title,
        kind,
        actorId: actorId ?? null,
      })),
    );
    await this.emailWatchers(filtered, filePath, title, kind, actorId);
  }

  /** Wysyła e-mail do obserwujących, którzy włączyli powiadomienia mailowe. */
  private async emailWatchers(
    recipients: Types.ObjectId[],
    filePath: string,
    title: string,
    kind: string,
    actorId: string | null,
  ): Promise<void> {
    const ids = recipients.map((r) => r.toString());
    const optedIn = await this.preferences.emailEnabledAmong(ids);
    if (optedIn.size === 0) return;

    const verb = this.verbForKind(kind);
    const actorName = actorId
      ? ((await this.usersService.findById(actorId))?.name ?? 'Someone')
      : 'CI';
    const appUrl = (
      this.config.get<string>('appUrl') ?? 'http://localhost:3002'
    ).replace(/\/+$/, '');
    const link = `${appUrl}/documents/view?path=${encodeURIComponent(filePath)}`;

    for (const id of ids) {
      if (!optedIn.has(id)) continue;
      const user = await this.usersService.findById(id);
      if (!user?.email) continue;
      await this.mailer.sendWatchNotification(user.email, {
        actorName,
        verb,
        filePath,
        title,
        link,
      });
    }
  }

  private verbForKind(kind: string): string {
    if (kind === 'moved') return 'moved';
    if (kind === 'comment') return 'commented on';
    if (kind === 'mention') return 'mentioned you in';
    return 'updated';
  }

  /**
   * Wysyła dzienny digest nieprzeczytanych powiadomień do userów, którzy go
   * włączyli. Zwraca liczbę wysłanych maili. Wołane z crona (i z testów).
   */
  async sendDailyDigests(): Promise<number> {
    const recipients = await this.preferences.digestRecipients();
    if (recipients.length === 0) return 0;
    const appUrl = (
      this.config.get<string>('appUrl') ?? 'http://localhost:3002'
    ).replace(/\/+$/, '');
    let sent = 0;
    for (const userId of recipients) {
      const unread = await this.notificationModel
        .find({ userId, readAt: null })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
        .exec();
      if (unread.length === 0) continue;
      const user = await this.usersService.findById(userId);
      if (!user?.email) continue;
      await this.mailer.sendDigest(
        user.email,
        unread.map((n) => ({
          title: n.title,
          filePath: n.filePath,
          verb: this.verbForKind(n.kind),
        })),
        `${appUrl}/notifications`,
      );
      sent++;
    }
    return sent;
  }

  /** Powiadomienia odbiorcy (najnowsze pierwsze); opcjonalnie tylko nieprzeczytane. */
  async listNotifications(
    workspaceId: string,
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number; before?: string } = {},
  ) {
    const filter: Record<string, unknown> = { workspaceId, userId };
    if (opts.unreadOnly) filter.readAt = null;
    // Kursor: pobierz starsze niż `before` (paginacja „załaduj więcej").
    if (opts.before) {
      const cursor = new Date(opts.before);
      if (!isNaN(cursor.getTime())) filter.createdAt = { $lt: cursor };
    }
    const items = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(opts.limit ?? 30, 100))
      .populate<{ actorId: UserDocument | null }>('actorId', 'name')
      .lean()
      .exec();
    return items.map((n) => {
      const actor = n.actorId as { name?: string } | null;
      return {
        id: n.uuid,
        filePath: n.filePath,
        title: n.title,
        kind: n.kind,
        actor: actor?.name ?? 'CI',
        read: !!n.readAt,
        createdAt: (n as unknown as { createdAt: Date }).createdAt,
      };
    });
  }

  /** Liczba nieprzeczytanych powiadomień odbiorcy. */
  async unreadCount(workspaceId: string, userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      workspaceId,
      userId,
      readAt: null,
    });
  }

  /** Oznacza jedno powiadomienie jako przeczytane; zwraca aktualny licznik. */
  async markNotificationRead(
    workspaceId: string,
    userId: string,
    uuid: string,
  ): Promise<{ unread: number }> {
    await this.notificationModel.updateOne(
      { workspaceId, userId, uuid, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return { unread: await this.unreadCount(workspaceId, userId) };
  }

  /** Oznacza wszystkie powiadomienia odbiorcy jako przeczytane. */
  async markAllNotificationsRead(
    workspaceId: string,
    userId: string,
  ): Promise<{ unread: number }> {
    await this.notificationModel.updateMany(
      { workspaceId, userId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return { unread: 0 };
  }

  /** Historia edycji dokumentu (najnowsze pierwsze) z licznikami +/-. */
  async listRevisions(workspaceId: string, filePath: string) {
    const revs = await this.revisionModel
      .find({ workspaceId, filePath })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate<{ updatedBy: UserDocument | null }>('updatedBy', 'name')
      .exec();

    return revs.map((r, idx) => {
      const parent = revs[idx + 1]; // starsza wersja
      const { additions, deletions } = lineDiff(
        parent ? parent.contentRaw : '',
        r.contentRaw,
      );
      return {
        id: r.uuid,
        hash: r.uuid.slice(0, 7),
        title: r.title,
        message: r.message,
        createdAt: r.get('createdAt') as Date,
        author: r.updatedBy ? r.updatedBy.name : 'CI',
        additions,
        deletions,
      };
    });
  }

  /** Diff danej rewizji względem poprzedniej (do widoku Version History). */
  async getDiff(workspaceId: string, revisionUuid: string) {
    const rev = await this.revisionModel
      .findOne({ uuid: revisionUuid, workspaceId })
      .populate<{ updatedBy: UserDocument | null }>('updatedBy', 'name')
      .exec();
    if (!rev) {
      throw new NotFoundException('Revision not found');
    }
    const parent = await this.revisionModel
      .findOne({
        workspaceId,
        filePath: rev.filePath,
        createdAt: { $lt: rev.get('createdAt') as Date },
      })
      .sort({ createdAt: -1 })
      .select('contentRaw')
      .exec();

    const diff = lineDiff(parent ? parent.contentRaw : '', rev.contentRaw);
    return {
      id: rev.uuid,
      hash: rev.uuid.slice(0, 7),
      filePath: rev.filePath,
      title: rev.title,
      message: rev.message,
      author: rev.updatedBy ? rev.updatedBy.name : 'CI',
      createdAt: rev.get('createdAt') as Date,
      additions: diff.additions,
      deletions: diff.deletions,
      lines: diff.lines,
    };
  }

  /** Pełna treść pojedynczej rewizji. */
  async getRevision(workspaceId: string, revisionUuid: string) {
    const r = await this.revisionModel
      .findOne({ uuid: revisionUuid, workspaceId })
      .populate<{ updatedBy: UserDocument | null }>('updatedBy', 'name')
      .exec();
    if (!r) {
      throw new NotFoundException('Revision not found');
    }
    return {
      id: r.uuid,
      filePath: r.filePath,
      title: r.title,
      contentRaw: r.contentRaw,
      createdAt: r.get('createdAt') as Date,
      author: r.updatedBy ? r.updatedBy.name : 'CI',
    };
  }

  /**
   * Algorytm A (backlinki): utrzymuje `links.incoming` spójne w całym workspace.
   * - cele, do których ten dokument linkuje → dodaj go do ich `incoming`,
   * - pozostałe dokumenty → usuń go z ich `incoming`,
   * - ustaw `incoming` tego dokumentu = ci, którzy do niego linkują.
   */
  private async reconcileBacklinks(
    workspaceId: string,
    filePath: string,
    outgoing: string[],
  ): Promise<void> {
    await this.documentModel.updateMany(
      { workspaceId, filePath: { $in: outgoing } },
      { $addToSet: { 'links.incoming': filePath } },
    );
    await this.documentModel.updateMany(
      { workspaceId, filePath: { $nin: [...outgoing, filePath] } },
      { $pull: { 'links.incoming': filePath } },
    );
    const linkers = await this.documentModel
      .find({ workspaceId, 'links.outgoing': filePath })
      .select('filePath')
      .exec();
    await this.documentModel.updateOne(
      { workspaceId, filePath },
      { $set: { 'links.incoming': linkers.map((d) => d.filePath) } },
    );
  }

  /** Graf dokumentów (Moduł C): węzły + krawędzie (linki do istniejących plików). */
  async getGraph(workspaceId: string) {
    const key = `graph:${workspaceId}`;
    const hit = this.cacheGet<{
      nodes: { filePath: string; title: string }[];
      edges: { from: string; to: string }[];
    }>(key);
    if (hit) return hit;

    const docs = await this.documentModel
      .find({ workspaceId })
      .select('filePath title links.outgoing')
      .exec();
    const paths = new Set(docs.map((d) => d.filePath));
    const nodes = docs.map((d) => ({ filePath: d.filePath, title: d.title }));
    const edges: { from: string; to: string }[] = [];
    for (const d of docs) {
      for (const to of d.links?.outgoing ?? []) {
        if (paths.has(to)) edges.push({ from: d.filePath, to });
      }
    }
    const result = { nodes, edges };
    this.cacheSet(key, result);
    return result;
  }

  /** Statystyki workspace liczone z realnych danych (rewizje = edycje). */
  async getStats(workspaceId: string) {
    const docs = await this.documentModel
      .find({ workspaceId })
      .select('filePath title')
      .exec();
    const revs = await this.revisionModel
      .find({ workspaceId })
      .populate<{ updatedBy: UserDocument | null }>('updatedBy', 'name')
      .sort({ createdAt: 1 })
      .exec();

    const authors = new Map<string, number>();
    const perDoc = new Map<string, number>();
    const perDay = new Map<string, number>();
    for (const r of revs) {
      const a = r.updatedBy ? r.updatedBy.name : 'CI';
      authors.set(a, (authors.get(a) ?? 0) + 1);
      perDoc.set(r.filePath, (perDoc.get(r.filePath) ?? 0) + 1);
      const day = (r.get('createdAt') as Date).toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }

    // Telemetria: odczyty (z czasem) + obserwacje.
    const reads = await this.eventModel
      .find({ workspaceId, kind: 'read' })
      .select('filePath durationMs')
      .exec();
    const readsPerDoc = new Map<string, number>();
    let totalDuration = 0;
    let durationSamples = 0;
    for (const e of reads) {
      readsPerDoc.set(e.filePath, (readsPerDoc.get(e.filePath) ?? 0) + 1);
      if (e.durationMs > 0) {
        totalDuration += e.durationMs;
        durationSamples++;
      }
    }
    const watches = await this.watchModel
      .find({ workspaceId })
      .select('filePath userId')
      .exec();
    const watchersPerDoc = new Map<string, number>();
    const watcherUsers = new Set<string>();
    for (const w of watches) {
      watchersPerDoc.set(w.filePath, (watchersPerDoc.get(w.filePath) ?? 0) + 1);
      watcherUsers.add(w.userId.toString());
    }

    const titleByPath = new Map(docs.map((d) => [d.filePath, d.title]));
    const topDocuments = [...perDoc.entries()]
      .map(([filePath, edits]) => ({
        filePath,
        title: titleByPath.get(filePath) ?? filePath,
        edits,
        reads: readsPerDoc.get(filePath) ?? 0,
      }))
      .sort((a, b) => b.edits - a.edits)
      .slice(0, 8);
    const mostWatched = [...watchersPerDoc.entries()]
      .map(([filePath, watchers]) => ({
        filePath,
        title: titleByPath.get(filePath) ?? filePath,
        watchers,
      }))
      .sort((a, b) => b.watchers - a.watchers)
      .slice(0, 8);
    const contributors = [...authors.entries()]
      .map(([name, edits]) => ({ name, edits }))
      .sort((a, b) => b.edits - a.edits);
    const editsOverTime = [...perDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return {
      documents: docs.length,
      edits: revs.length,
      contributors: contributors.length,
      reads: reads.length,
      avgReadTimeMs: durationSamples
        ? Math.round(totalDuration / durationSamples)
        : 0,
      activeWatchers: watcherUsers.size,
      topDocuments,
      mostWatched,
      contributorsList: contributors,
      editsOverTime,
    };
  }

  /**
   * Import .md z publicznego repo GitHub (Moduł F): drzewo + raw → pipeline upsert.
   */
  async indexSource(
    workspaceId: string,
    source: {
      provider?: string | null;
      repo?: string | null;
      branch?: string;
      root?: string;
    } | null,
    updatedBy: string | null,
  ): Promise<{ imported: number; total: number }> {
    if (!source || source.provider !== 'github' || !source.repo) {
      throw new BadRequestException('Configure a GitHub repository first');
    }
    const repo = source.repo
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/+$/, '');
    const branch = source.branch || 'main';
    const root = (source.root || '').replace(/^\/+|\/+$/g, '');

    const treeRes = await fetch(
      `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(
        branch,
      )}?recursive=1`,
      {
        headers: {
          'User-Agent': 'docugraph',
          Accept: 'application/vnd.github+json',
        },
      },
    );
    if (!treeRes.ok) {
      throw new BadRequestException(
        'Could not read repository — must be public; check owner/repo and branch',
      );
    }
    const data = (await treeRes.json()) as {
      tree?: { path: string; type: string }[];
    };
    const files = (data.tree ?? []).filter(
      (t) =>
        t.type === 'blob' &&
        t.path.toLowerCase().endsWith('.md') &&
        (!root || t.path === root || t.path.startsWith(`${root}/`)),
    );

    let imported = 0;
    for (const f of files.slice(0, 300)) {
      const rawRes = await fetch(
        `https://raw.githubusercontent.com/${repo}/${branch}/${f.path
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`,
      );
      if (!rawRes.ok) continue;
      const content = await rawRes.text();
      const filePath = root ? f.path.slice(root.length + 1) : f.path;
      if (!filePath || !filePath.toLowerCase().endsWith('.md')) continue;
      try {
        await this.upsert(
          workspaceId,
          filePath,
          content,
          updatedBy,
          `Imported from ${repo}@${branch}`,
        );
        imported++;
      } catch {
        // pomijamy pliki o nieprawidłowych ścieżkach
      }
    }
    return { imported, total: files.length };
  }

  // ---- Broken-link report + autofix (Algorytm B) ----

  private scanLinks(content: string, filePath: string) {
    const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    const base = path.posix.dirname(filePath);
    const out: { canonical: string; original: string; line: number }[] = [];
    content.split('\n').forEach((ln, i) => {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ln)) !== null) {
        const t = m[1].split('#')[0].split('?')[0].trim();
        if (
          !t ||
          /^[a-z]+:\/\//i.test(t) ||
          t.startsWith('mailto:') ||
          !t.toLowerCase().endsWith('.md')
        ) {
          continue;
        }
        const canonical = path.posix
          .normalize(path.posix.join(base, t))
          .replace(/^(\.\/)+/, '');
        if (!canonical.startsWith('..')) {
          out.push({ canonical, original: m[1], line: i + 1 });
        }
      }
    });
    return out;
  }

  private suggestTarget(broken: string, paths: Set<string>): string | null {
    const bn = path.posix.basename(broken);
    for (const p of paths) {
      if (path.posix.basename(p) === bn) return p;
    }
    return null;
  }

  /** Linki wskazujące na nieistniejące dokumenty + propozycja naprawy. */
  async getBrokenLinks(workspaceId: string) {
    const docs = await this.documentModel
      .find({ workspaceId })
      .select('filePath contentRaw')
      .exec();
    const paths = new Set(docs.map((d) => d.filePath));
    const result: {
      from: string;
      to: string;
      line: number;
      suggestion: string | null;
    }[] = [];
    for (const d of docs) {
      for (const link of this.scanLinks(d.contentRaw, d.filePath)) {
        if (!paths.has(link.canonical)) {
          result.push({
            from: d.filePath,
            to: link.canonical,
            line: link.line,
            suggestion: this.suggestTarget(link.canonical, paths),
          });
        }
      }
    }
    return result;
  }

  /**
   * Zwięzły raport zdrowia dokumentacji — pod bramkę CI/CD. `ok=false`, gdy są
   * zepsute linki. Liczy też sieroty (bez wejść/wyjść) i strony nieświeże (30+ dni).
   */
  async healthReport(workspaceId: string) {
    const key = `health:${workspaceId}`;
    const hit = this.cacheGet<{
      ok: boolean;
      counts: {
        documents: number;
        brokenLinks: number;
        orphans: number;
        stale: number;
      };
      brokenLinks: unknown[];
    }>(key);
    if (hit) return hit;

    const docs = await this.documentModel
      .find({ workspaceId })
      .select('filePath links.outgoing updatedAt')
      .lean()
      .exec();

    const paths = new Set(docs.map((d) => d.filePath));
    const hasIncoming = new Set<string>();
    for (const d of docs) {
      for (const to of d.links?.outgoing ?? []) {
        if (paths.has(to)) hasIncoming.add(to);
      }
    }

    const STALE_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let orphans = 0;
    let stale = 0;
    for (const d of docs) {
      const outgoing = (d.links?.outgoing ?? []).filter((t) => paths.has(t));
      if (outgoing.length === 0 && !hasIncoming.has(d.filePath)) orphans++;
      const updatedAt = (d as { updatedAt?: Date }).updatedAt;
      if (updatedAt && now - new Date(updatedAt).getTime() > STALE_MS) stale++;
    }

    const brokenLinks = await this.getBrokenLinks(workspaceId);
    const result = {
      ok: brokenLinks.length === 0,
      counts: {
        documents: docs.length,
        brokenLinks: brokenLinks.length,
        orphans,
        stale,
      },
      brokenLinks,
    };
    this.cacheSet(key, result);
    return result;
  }

  /**
   * Eksport całej dokumentacji do jednego, samowystarczalnego pliku HTML
   * (read-only). Nawigacja po lewej, dokumenty jako sekcje; linki wewnętrzne
   * `.md` przepisane na kotwice w obrębie pliku.
   */
  /** Wspólny arkusz stylów dla eksportów (single-file i multi-page). */
  private docsCss(): string {
    return `*{box-sizing:border-box}
body{margin:0;font:16px/1.7 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1e293b;background:#fff}
.layout{display:flex;max-width:1200px;margin:0 auto}
nav{position:sticky;top:0;align-self:flex-start;width:260px;height:100vh;overflow:auto;padding:24px 16px;border-right:1px solid #e2e8f0;background:#f8fafc}
nav .title{font-weight:700;font-size:18px;margin:0 0 16px;text-decoration:none;color:#0f172a;display:block}
nav .grp{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;margin:16px 0 6px}
nav a{display:block;padding:4px 8px;border-radius:6px;color:#334155;text-decoration:none;font-size:14px}
nav a:hover{background:#eef2f7}
main{flex:1;min-width:0;padding:40px 48px}
.path{font:12px ui-monospace,monospace;color:#94a3b8;margin-bottom:8px}
h1,h2,h3{line-height:1.25}
pre{background:#0b1020;color:#e2e8f0;padding:16px;border-radius:10px;overflow:auto}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
:not(pre)>code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:.9em}
a{color:#6d28d9}
img{max-width:100%}
blockquote{border-left:3px solid #c4b5fd;margin:0;padding:4px 16px;color:#475569}
table{border-collapse:collapse}td,th{border:1px solid #e2e8f0;padding:6px 10px}
@media(max-width:760px){nav{display:none}main{padding:24px}}`;
  }

  /**
   * Eksport wielostronicowy: ZIP ze statycznym site (strona per dokument +
   * współdzielony style.css + index.html). Linki wewnętrzne `.md` i nawigacja
   * są przepisane na względne ścieżki `.html`, więc działa z file://.
   */
  async exportZip(workspaceId: string): Promise<Buffer> {
    const JSZip = (await import('jszip')).default;
    const docs = await this.documentModel
      .find({ workspaceId })
      .select('filePath title contentHtml')
      .sort({ filePath: 1 })
      .lean()
      .exec();

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const brandRaw =
      (await this.workspaces.getName(workspaceId)) ?? 'Documentation';
    const brand = esc(brandRaw);
    const resolveRel = (base: string, rel: string) => {
      const stack = base.split('/').slice(0, -1);
      for (const part of rel.split('/')) {
        if (part === '..') stack.pop();
        else if (part !== '.' && part !== '') stack.push(part);
      }
      return stack.join('/');
    };
    const byPath = new Set(docs.map((d) => d.filePath));
    const htmlPathFor = (p: string) => p.replace(/\.md$/i, '.html');
    const relTo = (fromHtml: string, toHtml: string) =>
      path.posix.relative(path.posix.dirname(fromHtml), toHtml) ||
      path.posix.basename(toHtml);

    const groups = new Map<string, typeof docs>();
    for (const d of docs) {
      const folder = d.filePath.includes('/')
        ? d.filePath.split('/')[0]
        : 'Root';
      (groups.get(folder) ?? groups.set(folder, []).get(folder)!).push(d);
    }
    const navFor = (thisHtml: string) =>
      [...groups.entries()]
        .map(
          ([folder, items]) =>
            `<div class="grp">${esc(folder)}</div>` +
            items
              .map(
                (d) =>
                  `<a href="${relTo(thisHtml, htmlPathFor(d.filePath))}">${esc(
                    d.title || d.filePath,
                  )}</a>`,
              )
              .join(''),
        )
        .join('');

    const rewrite = (html: string, fromPath: string, thisHtml: string) =>
      html.replace(
        /href="([^":]+?\.md)((?:#[^"]*)?)"/g,
        (m, href: string, frag: string) => {
          const target = resolveRel(fromPath, href);
          if (!byPath.has(target)) return m;
          return `href="${relTo(thisHtml, htmlPathFor(target))}${frag || ''}"`;
        },
      );

    const page = (title: string, thisHtml: string, main: string) =>
      `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<link rel="stylesheet" href="${relTo(thisHtml, 'style.css')}" />
</head><body><div class="layout">
<nav><a class="title" href="${relTo(thisHtml, 'index.html')}">${brand}</a>${navFor(thisHtml)}</nav>
<main>${main}</main>
</div></body></html>`;

    const zip = new JSZip();
    zip.file('style.css', this.docsCss());
    for (const d of docs) {
      const thisHtml = htmlPathFor(d.filePath);
      const embedded = await this.embedImages(d.contentHtml ?? '', workspaceId);
      const main = `<div class="path">${esc(d.filePath)}</div>${rewrite(
        embedded,
        d.filePath,
        thisHtml,
      )}`;
      zip.file(thisHtml, page(d.title || d.filePath, thisHtml, main));
    }
    zip.file(
      'index.html',
      page(
        brandRaw,
        'index.html',
        `<h1>${brand}</h1><p>${docs.length} document${
          docs.length === 1 ? '' : 's'
        } — pick one from the sidebar.</p>`,
      ),
    );
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  async exportHtml(workspaceId: string): Promise<string> {
    const docs = await this.documentModel
      .find({ workspaceId })
      .select('filePath title contentHtml')
      .sort({ filePath: 1 })
      .lean()
      .exec();

    const slug = (p: string) => 'doc-' + p.replace(/[^a-zA-Z0-9]+/g, '-');
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const brand = esc(
      (await this.workspaces.getName(workspaceId)) ?? 'Documentation',
    );
    const byPath = new Set(docs.map((d) => d.filePath));
    const resolveRel = (base: string, rel: string) => {
      const stack = base.split('/').slice(0, -1);
      for (const part of rel.split('/')) {
        if (part === '..') stack.pop();
        else if (part !== '.' && part !== '') stack.push(part);
      }
      return stack.join('/');
    };

    // Rewrite internal .md links -> in-page anchors.
    const rewrite = (html: string, fromPath: string) =>
      html.replace(/href="([^":]+?\.md)((?:#[^"]*)?)"/g, (m, href: string) => {
        const target = resolveRel(fromPath, href);
        return byPath.has(target) ? `href="#${slug(target)}"` : m;
      });

    const groups = new Map<string, typeof docs>();
    for (const d of docs) {
      const folder = d.filePath.includes('/')
        ? d.filePath.split('/')[0]
        : 'Root';
      (groups.get(folder) ?? groups.set(folder, []).get(folder)!).push(d);
    }
    const nav = [...groups.entries()]
      .map(
        ([folder, items]) =>
          `<div class="grp">${esc(folder)}</div>` +
          items
            .map(
              (d) =>
                `<a href="#${slug(d.filePath)}">${esc(d.title || d.filePath)}</a>`,
            )
            .join(''),
      )
      .join('');

    const sections = (
      await Promise.all(
        docs.map(async (d) => {
          const embedded = await this.embedImages(
            d.contentHtml ?? '',
            workspaceId,
          );
          return `<section id="${slug(d.filePath)}"><div class="path">${esc(
            d.filePath,
          )}</div>${rewrite(embedded, d.filePath)}</section>`;
        }),
      )
    ).join('\n');

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${brand}</title>
<style>
*{box-sizing:border-box}
body{margin:0;font:16px/1.7 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1e293b;background:#fff}
.layout{display:flex;max-width:1200px;margin:0 auto}
nav{position:sticky;top:0;align-self:flex-start;width:260px;height:100vh;overflow:auto;padding:24px 16px;border-right:1px solid #e2e8f0;background:#f8fafc}
nav .title{font-weight:700;font-size:18px;margin:0 0 16px}
nav .grp{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;margin:16px 0 6px}
nav a{display:block;padding:4px 8px;border-radius:6px;color:#334155;text-decoration:none;font-size:14px}
nav a:hover{background:#eef2f7}
main{flex:1;min-width:0;padding:40px 48px}
section{padding-bottom:48px;margin-bottom:48px;border-bottom:1px solid #eef0f4}
section .path{font:12px ui-monospace,monospace;color:#94a3b8;margin-bottom:8px}
h1,h2,h3{line-height:1.25}
pre{background:#0b1020;color:#e2e8f0;padding:16px;border-radius:10px;overflow:auto}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
:not(pre)>code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:.9em}
a{color:#6d28d9}
img{max-width:100%}
blockquote{border-left:3px solid #c4b5fd;margin:0;padding:4px 16px;color:#475569}
table{border-collapse:collapse}td,th{border:1px solid #e2e8f0;padding:6px 10px}
@media(max-width:760px){nav{display:none}main{padding:24px}}
</style></head>
<body><div class="layout">
<nav><div class="title">${brand}</div>${nav}</nav>
<main>${sections}</main>
</div></body></html>`;
  }

  /** Najnowiej zmienione dokumenty (do feedu „ostatnie zmiany"). */
  async recent(workspaceId: string, limit = 30) {
    const docs = await this.documentModel
      .find({ workspaceId })
      .select('filePath title updatedAt')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) => ({
      filePath: d.filePath,
      title: d.title,
      updatedAt: (d as { updatedAt?: Date }).updatedAt ?? null,
    }));
  }

  /** Naprawia zepsuty link: przepisuje cel w źródle na najbliższe dopasowanie. */
  async fixBrokenLink(
    workspaceId: string,
    from: string,
    to: string,
    updatedBy: string | null,
  ) {
    const doc = await this.documentModel
      .findOne({ workspaceId, filePath: from })
      .exec();
    if (!doc) throw new NotFoundException('Source document not found');

    const paths = new Set(
      (await this.documentModel.find({ workspaceId }).select('filePath').exec())
        .map((d) => d.filePath)
        .filter((p) => p !== from),
    );
    const suggestion = this.suggestTarget(to, paths);
    if (!suggestion) {
      throw new BadRequestException('No matching document to fix to');
    }
    const link = this.scanLinks(doc.contentRaw, from).find(
      (l) => l.canonical === to,
    );
    if (!link) throw new BadRequestException('Broken link not found in source');

    const newRel =
      path.posix.relative(path.posix.dirname(from), suggestion) ||
      path.posix.basename(suggestion);
    const newContent = doc.contentRaw
      .split(`](${link.original})`)
      .join(`](${newRel})`);

    await this.upsert(
      workspaceId,
      from,
      newContent,
      updatedBy,
      `Fix broken link → ${suggestion}`,
    );
    return { fixed: true, from, to, replacement: suggestion };
  }

  /**
   * Naprawia wszystkie zepsute linki, które mają jednoznaczną propozycję.
   * Grupuje po dokumencie źródłowym, by każdy zapisać raz (jedna rewizja/doc).
   * Linki bez dopasowania trafiają do `skipped`.
   */
  async fixAllBrokenLinks(workspaceId: string, updatedBy: string | null) {
    const docs = await this.documentModel
      .find({ workspaceId })
      .select('filePath contentRaw')
      .exec();
    const allPaths = new Set(docs.map((d) => d.filePath));
    const fixed: { from: string; to: string; replacement: string }[] = [];
    const skipped: { from: string; to: string }[] = [];

    for (const d of docs) {
      const brokenInDoc = this.scanLinks(d.contentRaw, d.filePath).filter(
        (l) => !allPaths.has(l.canonical),
      );
      if (brokenInDoc.length === 0) continue;

      const paths = new Set([...allPaths].filter((p) => p !== d.filePath));
      let content = d.contentRaw;
      let changed = 0;
      const replacedHrefs = new Set<string>();

      for (const link of brokenInDoc) {
        const suggestion = this.suggestTarget(link.canonical, paths);
        if (!suggestion) {
          skipped.push({ from: d.filePath, to: link.canonical });
          continue;
        }
        // Każdy unikalny href przepisujemy raz (split/join podmienia wszystkie).
        if (!replacedHrefs.has(link.original)) {
          const newRel =
            path.posix.relative(path.posix.dirname(d.filePath), suggestion) ||
            path.posix.basename(suggestion);
          content = content.split(`](${link.original})`).join(`](${newRel})`);
          replacedHrefs.add(link.original);
          changed++;
        }
        fixed.push({
          from: d.filePath,
          to: link.canonical,
          replacement: suggestion,
        });
      }

      if (changed > 0) {
        await this.upsert(
          workspaceId,
          d.filePath,
          content,
          updatedBy,
          `Fix ${changed} broken link${changed > 1 ? 's' : ''}`,
        );
      }
    }

    return {
      fixedCount: fixed.length,
      skippedCount: skipped.length,
      fixed,
      skipped,
    };
  }

  /**
   * Przenosi/zmienia ścieżkę dokumentu i automatycznie refaktoryzuje linki
   * (Algorytm B w obie strony):
   *  - linki przychodzące: każdy dokument linkujący do `from` → przepisany na `to`,
   *  - linki wychodzące przeniesionego pliku → przepisane tak, by nadal
   *    wskazywały te same cele z nowej lokalizacji.
   * Rewizje i komentarze podążają za nową ścieżką.
   */
  async moveDocument(
    workspaceId: string,
    fromRaw: string,
    toRaw: string,
    updatedBy: string | null,
  ) {
    const from = path.posix.normalize(fromRaw).replace(/^(\.\/)+/, '');
    const to = path.posix.normalize(toRaw).replace(/^(\.\/)+/, '');
    if (!to.toLowerCase().endsWith('.md')) {
      throw new BadRequestException('Target path must be a .md file');
    }
    if (from === to) {
      return { moved: false, from, to, refactoredLinks: 0 };
    }

    const src = await this.documentModel
      .findOne({ workspaceId, filePath: from })
      .exec();
    if (!src) throw new NotFoundException('Source document not found');
    const clash = await this.documentModel
      .findOne({ workspaceId, filePath: to })
      .exec();
    if (clash) throw new BadRequestException('Target path already exists');

    // Pass B — zachowaj cele linków wychodzących z przeniesionego pliku.
    let newContent = src.contentRaw;
    for (const link of this.scanLinks(src.contentRaw, from)) {
      const newRel =
        path.posix.relative(path.posix.dirname(to), link.canonical) ||
        path.posix.basename(link.canonical);
      newContent = newContent.split(`](${link.original})`).join(`](${newRel})`);
    }

    // Zbierz linkujących PRZED usunięciem starego rekordu.
    const linkers = await this.documentModel
      .find({ workspaceId, 'links.outgoing': from })
      .exec();

    // Przenieś sam plik: nowy zapis + usunięcie starego rekordu i pliku.
    await this.storage.deleteFile(workspaceId, from);
    await this.documentModel.deleteOne({ workspaceId, filePath: from });
    await this.documentModel.updateMany(
      { workspaceId },
      { $pull: { 'links.incoming': from } },
    );
    await this.upsert(
      workspaceId,
      to,
      newContent,
      updatedBy,
      `Move ${from} → ${to}`,
    );

    // Rewizje i komentarze podążają za plikiem.
    await this.revisionModel.updateMany(
      { workspaceId, filePath: from },
      { $set: { filePath: to } },
    );
    await this.commentModel.updateMany(
      { workspaceId, filePath: from },
      { $set: { filePath: to } },
    );

    // Pass A — przepisz linki przychodzące w dokumentach linkujących.
    let refactoredLinks = 0;
    for (const linker of linkers) {
      if (linker.filePath === from) continue;
      const hits = this.scanLinks(linker.contentRaw, linker.filePath).filter(
        (l) => l.canonical === from,
      );
      if (!hits.length) continue;
      const newRel =
        path.posix.relative(path.posix.dirname(linker.filePath), to) ||
        path.posix.basename(to);
      let content = linker.contentRaw;
      for (const l of hits) {
        content = content.split(`](${l.original})`).join(`](${newRel})`);
        refactoredLinks++;
      }
      await this.upsert(
        workspaceId,
        linker.filePath,
        content,
        updatedBy,
        `Refactor link ${from} → ${to}`,
      );
    }

    // Obserwacje podążają za plikiem, a obserwujący dostają powiadomienie.
    await this.migrateWatchesAndNotifyMove(
      workspaceId,
      from,
      to,
      src.title,
      updatedBy,
    );

    this.invalidateWorkspace(workspaceId);
    return { moved: true, from, to, refactoredLinks };
  }

  /**
   * Usuwa dokument: powiadamia obserwujących ('deleted'), po czym kasuje plik,
   * rekord, rewizje, komentarze i obserwacje oraz czyści backlinki wskazujące
   * na ten dokument.
   */
  async deleteDocument(
    workspaceId: string,
    filePathRaw: string,
    deletedBy: string | null,
  ) {
    const filePath = path.posix.normalize(filePathRaw).replace(/^(\.\/)+/, '');
    const doc = await this.documentModel
      .findOne({ workspaceId, filePath })
      .select('title')
      .exec();
    if (!doc) throw new NotFoundException('Document not found');

    // Powiadom obserwujących zanim skasujemy obserwacje.
    await this.notifyWatchers(
      workspaceId,
      filePath,
      doc.title,
      deletedBy,
      'deleted',
    );

    await this.storage.deleteFile(workspaceId, filePath);
    await this.documentModel.deleteOne({ workspaceId, filePath });
    await this.revisionModel.deleteMany({ workspaceId, filePath });
    await this.commentModel.deleteMany({ workspaceId, filePath });
    await this.watchModel.deleteMany({ workspaceId, filePath });
    // Zdejmij ten plik z backlinków innych dokumentów.
    await this.documentModel.updateMany(
      { workspaceId },
      { $pull: { 'links.incoming': filePath } },
    );

    this.invalidateWorkspace(workspaceId);
    return { deleted: true, filePath };
  }

  /** Przenosi obserwacje `from`→`to` i powiadamia obserwujących (poza autorem). */
  private async migrateWatchesAndNotifyMove(
    workspaceId: string,
    from: string,
    to: string,
    title: string,
    actorId: string | null,
  ): Promise<void> {
    const watchers = await this.watchModel
      .find({ workspaceId, filePath: from })
      .select('userId')
      .lean()
      .exec();
    if (watchers.length === 0) return;

    for (const w of watchers) {
      try {
        await this.watchModel.updateOne(
          { workspaceId, userId: w.userId, filePath: from },
          { $set: { filePath: to } },
        );
      } catch {
        // Użytkownik już obserwuje `to` (kolizja unikalnego indeksu) — usuń stary.
        await this.watchModel.deleteOne({
          workspaceId,
          userId: w.userId,
          filePath: from,
        });
      }
    }

    // Obserwacje już wskazują `to` — powiadom (in-app + e-mail) jednym torem.
    await this.notifyWatchers(workspaceId, to, title, actorId, 'moved');
  }

  async getByPath(
    workspaceId: string,
    filePath: string,
  ): Promise<DocumentEntityDocument> {
    const doc = await this.documentModel
      .findOne({ workspaceId, filePath })
      .populate('updatedBy', 'name')
      .exec();
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  async list(workspaceId: string) {
    const [docs, readAgg, broken] = await Promise.all([
      this.documentModel
        .find({ workspaceId })
        .select(
          'filePath title updatedAt metadata updatedBy contentRaw links.outgoing',
        )
        .populate<{ updatedBy: { uuid: string } | null }>('updatedBy', 'uuid')
        .sort({ filePath: 1 })
        .exec(),
      this.eventModel
        .aggregate<{
          _id: string;
          reads: number;
        }>([
          {
            $match: {
              workspaceId: new Types.ObjectId(workspaceId),
              kind: 'read',
            },
          },
          { $group: { _id: '$filePath', reads: { $sum: 1 } } },
        ])
        .exec(),
      this.getBrokenLinks(workspaceId),
    ]);
    const readsByPath = new Map(readAgg.map((r) => [r._id, r.reads]));

    // Per-document health (surfaced as badges in the list).
    const paths = new Set(docs.map((d) => d.filePath));
    const hasIncoming = new Set<string>();
    for (const d of docs) {
      for (const to of d.links?.outgoing ?? []) {
        if (paths.has(to)) hasIncoming.add(to);
      }
    }
    const brokenFrom = new Set(broken.map((b) => b.from));
    const STALE_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return docs.map((d) => {
      const updatedAt = d.get('updatedAt') as Date;
      const outInternal = (d.links?.outgoing ?? []).filter((t) =>
        paths.has(t),
      ).length;
      return {
        filePath: d.filePath,
        title: d.title,
        updatedAt,
        status: d.metadata?.status ?? null,
        tags: d.metadata?.tags ?? [],
        updatedBy: d.updatedBy ? d.updatedBy.uuid : null,
        size: Buffer.byteLength(d.contentRaw ?? '', 'utf8'),
        reads: readsByPath.get(d.filePath) ?? 0,
        health: {
          broken: brokenFrom.has(d.filePath),
          orphan: outInternal === 0 && !hasIncoming.has(d.filePath),
          stale: updatedAt
            ? now - new Date(updatedAt).getTime() > STALE_MS
            : false,
        },
      };
    });
  }

  /** Wyszukiwanie pełnotekstowe (Moduł B) — scoped do workspace, po trafności. */
  async search(workspaceId: string, query: string) {
    const docs = await this.documentModel
      .find(
        { workspaceId, $text: { $search: query } },
        { score: { $meta: 'textScore' } },
      )
      .select('filePath title contentRaw metadata.status')
      .sort({ score: { $meta: 'textScore' } })
      .limit(20)
      .exec();

    const q = query.toLowerCase();
    return docs.map((d) => ({
      filePath: d.filePath,
      title: d.title,
      status: d.metadata?.status ?? null,
      snippet: this.snippet(d.contentRaw, query),
      // facety: dopasowanie w nazwie dokumentu vs w nagłówku treści
      inTitle:
        d.title.toLowerCase().includes(q) ||
        d.filePath.toLowerCase().includes(q),
      inHeading: d.contentRaw
        .split('\n')
        .some((ln) => /^#{1,6}\s/.test(ln) && ln.toLowerCase().includes(q)),
    }));
  }

  private snippet(raw: string, query: string): string {
    // Pomiń wiodący blok frontmattera (---\n…\n---), by nie trafiał do podglądu.
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const text = body.replace(/\s+/g, ' ').trim();
    const term = query.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const i = term ? text.toLowerCase().indexOf(term) : -1;
    if (i < 0) return text.slice(0, 140);
    const start = Math.max(0, i - 60);
    return (
      (start > 0 ? '…' : '') +
      text.slice(start, start + 140) +
      (text.length > start + 140 ? '…' : '')
    );
  }
}
