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
import { UserDocument } from '../users/schemas/user.schema';
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
    private readonly storage: WorkspaceStorageService,
    private readonly parser: MarkdownParserService,
  ) {}

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
    }
    return doc;
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
    return { nodes, edges };
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
    return {
      ok: brokenLinks.length === 0,
      counts: {
        documents: docs.length,
        brokenLinks: brokenLinks.length,
        orphans,
        stale,
      },
      brokenLinks,
    };
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

    return { moved: true, from, to, refactoredLinks };
  }

  async getByPath(
    workspaceId: string,
    filePath: string,
  ): Promise<DocumentEntityDocument> {
    const doc = await this.documentModel
      .findOne({ workspaceId, filePath })
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
        .select('filePath title updatedAt metadata updatedBy contentRaw links.outgoing')
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
