import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CombinedAuthGuard } from '../common/guards/combined-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestWithWorkspace } from '../common/interfaces/request-with-workspace.interface';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DocumentEntityDocument } from './schemas/document.schema';
import { CreateDocumentDto } from './dto/create-document.dto';
import { FixBrokenLinkDto } from './dto/fix-broken-link.dto';
import { SourceDto } from './dto/source.dto';
import { AddCommentDto, ResolveCommentDto } from './dto/comment.dto';
import { SetReviewStatusDto } from './dto/review-status.dto';
import { CreateShareLinkDto } from './dto/share-link.dto';
import { BulkOperationDto } from './dto/bulk-operation.dto';
import { MoveDocumentDto } from './dto/move-document.dto';
import { ReadEventDto, WatchDto } from './dto/telemetry.dto';
import { PublishDto } from './dto/publish.dto';
import { DocumentsService } from './documents.service';
import { GitPublishService } from './git-publish.service';
import { AutoPublishService } from './auto-publish.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AccessService, AccessChecker } from '../access/access.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

@Controller('workspaces/:id/documents')
@UseGuards(CombinedAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly workspacesService: WorkspacesService,
    private readonly gitPublish: GitPublishService,
    private readonly autoPublish: AutoPublishService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  /** Aktor akcji: zalogowany user (JWT) albo null dla tokenu CI. */
  private actorOf(req: RequestWithWorkspace): string | null {
    return req.authType === 'jwt' ? req.user.userId : null;
  }

  /** Checker dostępu dla bieżącego usera (CI/Owner = pełny dostęp). */
  private checker(
    workspaceId: string,
    req: RequestWithWorkspace,
  ): Promise<AccessChecker> {
    return this.access.buildChecker(
      workspaceId,
      this.actorOf(req),
      req.workspaceRole,
    );
  }

  /** Rzuca 403, gdy user nie ma prawa zapisu do ścieżki. */
  private async assertCanWrite(
    workspaceId: string,
    req: RequestWithWorkspace,
    filePath: string,
  ): Promise<void> {
    const check = await this.checker(workspaceId, req);
    if (check(filePath) !== 'write') {
      throw new ForbiddenException('No write access to this path');
    }
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async upsert(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: CreateDocumentDto,
  ) {
    await this.assertCanWrite(workspaceId, req, dto.file_path);
    const updatedBy = req.authType === 'jwt' ? req.user.userId : null;
    const doc = await this.documentsService.upsert(
      workspaceId,
      dto.file_path,
      dto.content_raw,
      updatedBy,
      dto.message,
    );
    this.autoPublish.schedule(workspaceId); // bidirectional sync (no-op if off)
    return this.toFull(doc);
  }

  @Get()
  async list(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    return this.documentsService.list(
      workspaceId,
      await this.checker(workspaceId, req),
    );
  }

  @Get('graph')
  async graph(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    return this.documentsService.getGraph(
      workspaceId,
      await this.checker(workspaceId, req),
    );
  }

  @Get('stats')
  stats(@Param('id') workspaceId: string) {
    return this.documentsService.getStats(workspaceId);
  }

  // ---- Telemetria: odczyty + obserwacje ----

  @Post('events/read')
  recordRead(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: ReadEventDto,
  ) {
    const userId = req.authType === 'jwt' ? req.user.userId : null;
    return this.documentsService.recordRead(
      workspaceId,
      dto.path,
      userId,
      dto.durationMs ?? 0,
    );
  }

  @Get('watching')
  watching(@Param('id') workspaceId: string, @Req() req: RequestWithWorkspace) {
    if (req.authType !== 'jwt') return [];
    return this.documentsService.listWatching(workspaceId, req.user.userId);
  }

  /** Ostatnio przeglądane przez zalogowanego usera (historia przeglądania). */
  @Get('recently-viewed')
  async recentlyViewed(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    if (req.authType !== 'jwt') return [];
    return this.documentsService.recentlyViewed(
      workspaceId,
      req.user.userId,
      15,
      await this.checker(workspaceId, req),
    );
  }

  @Get('favorites')
  favorites(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    if (req.authType !== 'jwt') return [];
    return this.documentsService.listFavorites(workspaceId, req.user.userId);
  }

  @Post('favorite')
  setFavorite(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: WatchDto,
  ) {
    if (req.authType !== 'jwt') {
      throw new BadRequestException('Favorites require a signed-in user');
    }
    return this.documentsService.setFavorite(
      workspaceId,
      req.user.userId,
      dto.path,
      dto.on,
    );
  }

  @Post('watch')
  setWatch(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: WatchDto,
  ) {
    if (req.authType !== 'jwt') {
      throw new BadRequestException('Watching requires a signed-in user');
    }
    return this.documentsService.setWatch(
      workspaceId,
      req.user.userId,
      dto.path,
      dto.on,
    );
  }

  // ---- Powiadomienia o zmianach w obserwowanych dokumentach ----

  @Get('notifications')
  async notifications(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Query('unread') unread?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    if (req.authType !== 'jwt') return [];
    return this.documentsService.listNotifications(
      workspaceId,
      req.user.userId,
      {
        unreadOnly: unread === '1' || unread === 'true',
        before,
        limit: limit ? parseInt(limit, 10) : undefined,
        access: await this.checker(workspaceId, req),
      },
    );
  }

  @Get('notifications/count')
  async notificationCount(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    if (req.authType !== 'jwt') return { unread: 0 };
    return {
      unread: await this.documentsService.unreadCount(
        workspaceId,
        req.user.userId,
      ),
    };
  }

  @Post('notifications/read-all')
  readAllNotifications(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    if (req.authType !== 'jwt') {
      throw new BadRequestException('Notifications require a signed-in user');
    }
    return this.documentsService.markAllNotificationsRead(
      workspaceId,
      req.user.userId,
    );
  }

  @Post('notifications/:uuid/read')
  readNotification(
    @Param('id') workspaceId: string,
    @Param('uuid') uuid: string,
    @Req() req: RequestWithWorkspace,
  ) {
    if (req.authType !== 'jwt') {
      throw new BadRequestException('Notifications require a signed-in user');
    }
    return this.documentsService.markNotificationRead(
      workspaceId,
      req.user.userId,
      uuid,
    );
  }

  // ---- Review / komentarze ----

  @Get('comments')
  comments(@Param('id') workspaceId: string, @Query('path') path: string) {
    if (!path || typeof path !== 'string') {
      throw new BadRequestException('Query param "path" must be a string');
    }
    return this.documentsService.listComments(workspaceId, path);
  }

  @Post('comments')
  async addComment(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: AddCommentDto,
  ) {
    if (req.authType !== 'jwt' || !req.user.userId) {
      throw new BadRequestException('Comments require a signed-in user');
    }
    // Rozwiąż wzmianki (uuid → wewn. id) tylko dla realnych członków workspace.
    const mentionIds: string[] = [];
    for (const uuid of dto.mentions ?? []) {
      const internal = await this.workspacesService.resolveUserId(uuid);
      if (
        internal &&
        (await this.workspacesService.findMembership(workspaceId, internal))
      ) {
        mentionIds.push(internal);
      }
    }
    return this.documentsService.addComment(
      workspaceId,
      dto.path,
      dto.line,
      dto.quote ?? '',
      dto.body,
      req.user.userId,
      mentionIds,
    );
  }

  @Post('comments/resolve')
  resolveComment(
    @Param('id') workspaceId: string,
    @Body() dto: ResolveCommentDto,
  ) {
    return this.documentsService.setThreadResolved(
      workspaceId,
      dto.path,
      dto.line,
      dto.resolved,
    );
  }

  @Get('review-status')
  async reviewStatus(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Query('path') path: string,
  ) {
    if (!path || typeof path !== 'string') {
      throw new BadRequestException('Query param "path" must be a string');
    }
    const check = await this.checker(workspaceId, req);
    if (check(path) === 'none') {
      throw new NotFoundException('Document not found');
    }
    return this.documentsService.getReviewStatus(workspaceId, path);
  }

  @Post('review-status')
  async setReviewStatus(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: SetReviewStatusDto,
  ) {
    // Recenzja to akcja zapisu na ścieżce — wymaga prawa write (i uszanuje ACL).
    await this.assertCanWrite(workspaceId, req, dto.path);
    return this.documentsService.setReviewStatus(
      workspaceId,
      dto.path,
      dto.status,
      this.actorOf(req),
    );
  }

  // ---- Publiczne linki tylko-do-odczytu (tylko dla mających prawo zapisu) ----

  @Get('share-links')
  async listShareLinks(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Query('path') path: string,
  ) {
    if (!path || typeof path !== 'string') {
      throw new BadRequestException('Query param "path" must be a string');
    }
    await this.assertCanWrite(workspaceId, req, path);
    return this.documentsService.listShareLinks(workspaceId, path);
  }

  @Post('share-links')
  async createShareLink(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: CreateShareLinkDto,
  ) {
    await this.assertCanWrite(workspaceId, req, dto.path);
    return this.documentsService.createShareLink(
      workspaceId,
      dto.path,
      this.actorOf(req),
      dto.expiresInDays,
    );
  }

  @Delete('share-links/:linkId')
  async revokeShareLink(
    @Param('id') workspaceId: string,
    @Param('linkId') linkId: string,
    @Req() req: RequestWithWorkspace,
    @Query('path') path: string,
  ) {
    if (!path || typeof path !== 'string') {
      throw new BadRequestException('Query param "path" must be a string');
    }
    await this.assertCanWrite(workspaceId, req, path);
    return this.documentsService.revokeShareLink(workspaceId, path, linkId);
  }

  // ---- Source (Git) — Moduł F ----

  @Get('source')
  getSource(@Param('id') workspaceId: string) {
    return this.workspacesService.getSource(workspaceId);
  }

  @Put('source')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  async setSource(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: SourceDto,
  ) {
    const result = await this.workspacesService.setSource(workspaceId, dto);
    await this.audit.log({
      workspaceId,
      actorId: this.actorOf(req),
      action: 'source.configured',
      target: dto.repo ?? null,
      metadata: { branch: dto.branch, bidirectional: dto.bidirectional },
    });
    return result;
  }

  @Get('source/webhook')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  getWebhookConfig(@Param('id') workspaceId: string) {
    return this.workspacesService.getWebhookConfig(workspaceId);
  }

  @Post('source/index')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async indexSource(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    const source = await this.workspacesService.getSource(workspaceId);
    const token = await this.workspacesService.getImportToken(workspaceId);
    const updatedBy = req.authType === 'jwt' ? req.user.userId : null;
    const result = await this.documentsService.indexSource(
      workspaceId,
      source,
      updatedBy,
      token,
    );
    await this.workspacesService.markIndexed(workspaceId);
    return result;
  }

  @Post('source/publish')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async publish(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: PublishDto,
  ) {
    const remote = await this.workspacesService.getPushRemote(workspaceId);
    if (!remote) {
      throw new BadRequestException(
        'Configure a push remote first (Connect → publishing).',
      );
    }
    const source = (await this.workspacesService.getSource(workspaceId)) as {
      branch?: string;
    } | null;
    const branch = source?.branch || 'main';

    let authorName = 'DocuGraph';
    let authorEmail = 'docugraph@localhost';
    if (req.authType === 'jwt') {
      const user = await this.usersService.findById(req.user.userId);
      if (user) {
        authorName = user.name;
        authorEmail = user.email;
      }
    }

    const result = await this.gitPublish.publish({
      workspaceId,
      remote,
      branch,
      message: dto.message || 'Publish from DocuGraph',
      authorName,
      authorEmail,
    });
    await this.audit.log({
      workspaceId,
      actorId: this.actorOf(req),
      action: 'documents.published',
      target: branch,
      metadata: { pushed: result.pushed, commit: result.commit ?? null },
    });
    return result;
  }

  @Post('move')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async move(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: MoveDocumentDto,
  ) {
    await this.assertCanWrite(workspaceId, req, dto.from);
    await this.assertCanWrite(workspaceId, req, dto.to);
    const updatedBy = this.actorOf(req);
    const result = await this.documentsService.moveDocument(
      workspaceId,
      dto.from,
      dto.to,
      updatedBy,
    );
    await this.audit.log({
      workspaceId,
      actorId: updatedBy,
      action: 'document.moved',
      target: `${dto.from} → ${dto.to}`,
    });
    this.autoPublish.schedule(workspaceId); // bidirectional sync (no-op if off)
    return result;
  }

  @Post('bulk')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async bulk(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: BulkOperationDto,
  ) {
    if ((dto.op === 'addTag' || dto.op === 'removeTag') && !dto.tag?.trim()) {
      throw new BadRequestException('A tag is required for this operation');
    }
    const actor = this.actorOf(req);
    const check = await this.checker(workspaceId, req);
    const result = await this.documentsService.bulkOperation(
      workspaceId,
      dto.op,
      dto.paths,
      { tag: dto.tag?.trim(), toFolder: dto.toFolder },
      actor,
      check,
    );
    await this.audit.log({
      workspaceId,
      actorId: actor,
      action: 'document.bulk',
      target: `${dto.op} × ${result.ok}`,
    });
    if (result.ok > 0) this.autoPublish.schedule(workspaceId);
    return result;
  }

  @Delete()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async remove(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Query('path') path: string,
  ) {
    if (!path || typeof path !== 'string') {
      throw new BadRequestException('Query param "path" must be a string');
    }
    await this.assertCanWrite(workspaceId, req, path);
    const deletedBy = this.actorOf(req);
    const result = await this.documentsService.deleteDocument(
      workspaceId,
      path,
      deletedBy,
    );
    await this.audit.log({
      workspaceId,
      actorId: deletedBy,
      action: 'document.deleted',
      target: path,
    });
    this.autoPublish.schedule(workspaceId); // bidirectional sync (no-op if off)
    return result;
  }

  @Get('broken-links')
  brokenLinks(@Param('id') workspaceId: string) {
    return this.documentsService.getBrokenLinks(workspaceId);
  }

  /** Zwięzłe zdrowie dokumentacji dla CI (działa z tokenem dg_live_…). */
  @Get('health')
  async health(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    return this.documentsService.healthReport(
      workspaceId,
      await this.checker(workspaceId, req),
    );
  }

  /** Eksport całej dokumentacji do jednego pliku HTML (read-only). */
  @Get('export.html')
  async exportHtml(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Res() res: Response,
  ) {
    const html = await this.documentsService.exportHtml(
      workspaceId,
      await this.checker(workspaceId, req),
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /** Eksport wielostronicowy — ZIP ze statycznym site (read-only). */
  @Get('export.zip')
  async exportZip(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Res() res: Response,
  ) {
    const buffer = await this.documentsService.exportZip(
      workspaceId,
      await this.checker(workspaceId, req),
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="documentation.zip"',
    );
    res.send(buffer);
  }

  /** Eksport źródłowy — ZIP z surowymi `.md` (odwzorowanie katalogu). */
  @Get('export/source.zip')
  async exportSourceZip(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Res() res: Response,
  ) {
    const buffer = await this.documentsService.exportSourceZip(
      workspaceId,
      await this.checker(workspaceId, req),
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="documentation-source.zip"',
    );
    res.send(buffer);
  }

  /** Import ZIP — wgrywa `.md` z archiwum, odwzorowując strukturę katalogów. */
  @Post('import.zip')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  async importZip(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer) throw new BadRequestException('No file uploaded');
    const result = await this.documentsService.importZip(
      workspaceId,
      file.buffer,
      this.actorOf(req),
    );
    this.autoPublish.schedule(workspaceId); // bidirectional sync (no-op if off)
    return result;
  }

  /** Atom feed ostatnio zmienionych dokumentów. */
  @Get('feed.atom')
  async feed(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Res() res: Response,
  ) {
    const items = await this.documentsService.recent(
      workspaceId,
      30,
      await this.checker(workspaceId, req),
    );
    const appUrl = (
      this.config.get<string>('appUrl') ?? 'http://localhost:3002'
    ).replace(/\/+$/, '');
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const updated =
      items[0]?.updatedAt?.toISOString() ?? new Date(0).toISOString();
    const entries = items
      .map((d) => {
        const link = `${appUrl}/documents/view?path=${encodeURIComponent(d.filePath)}`;
        const id = `urn:docugraph:${workspaceId}:${esc(d.filePath)}`;
        return `  <entry>
    <title>${esc(d.title)}</title>
    <id>${id}</id>
    <updated>${(d.updatedAt ?? new Date(0)).toISOString()}</updated>
    <link rel="alternate" href="${esc(link)}"/>
    <summary>${esc(d.filePath)}</summary>
  </entry>`;
      })
      .join('\n');
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>DocuGraph — recently updated</title>
  <id>urn:docugraph:workspace:${workspaceId}</id>
  <updated>${updated}</updated>
${entries}
</feed>
`;
    res.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
    res.send(xml);
  }

  @Post('broken-links/fix')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async fixBrokenLink(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: FixBrokenLinkDto,
  ) {
    const updatedBy = req.authType === 'jwt' ? req.user.userId : null;
    const result = await this.documentsService.fixBrokenLink(
      workspaceId,
      dto.from,
      dto.to,
      updatedBy,
    );
    this.autoPublish.schedule(workspaceId); // bidirectional sync (no-op if off)
    return result;
  }

  @Post('broken-links/fix-all')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async fixAllBrokenLinks(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    const updatedBy = req.authType === 'jwt' ? req.user.userId : null;
    const result = await this.documentsService.fixAllBrokenLinks(
      workspaceId,
      updatedBy,
    );
    this.autoPublish.schedule(workspaceId); // bidirectional sync (no-op if off)
    return result;
  }

  @Get('revisions')
  revisions(
    @Param('id') workspaceId: string,
    @Query('path') path: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    if (!path || typeof path !== 'string') {
      throw new BadRequestException('Query param "path" must be a string');
    }
    return this.documentsService.listRevisions(workspaceId, path, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('revision/:revId')
  revision(@Param('id') workspaceId: string, @Param('revId') revId: string) {
    return this.documentsService.getRevision(workspaceId, revId);
  }

  @Get('diff/:revId')
  diff(@Param('id') workspaceId: string, @Param('revId') revId: string) {
    return this.documentsService.getDiff(workspaceId, revId);
  }

  @Get('search')
  async search(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Query('q') q: string,
  ) {
    if (!q || typeof q !== 'string') {
      throw new BadRequestException('Query param "q" must be a string');
    }
    return this.documentsService.search(
      workspaceId,
      q,
      await this.checker(workspaceId, req),
    );
  }

  @Get('by-path')
  async getByPath(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Query('path') path: string,
  ) {
    // Wymuszamy string — query param może przyjść jako obiekt/tablica
    // (np. ?path[$ne]=), co byłoby wektorem NoSQL injection.
    if (!path || typeof path !== 'string') {
      throw new BadRequestException('Query param "path" must be a string');
    }
    // Ukryte dokumenty → 404 (nie ujawniamy istnienia).
    const check = await this.checker(workspaceId, req);
    if (check(path) === 'none') {
      throw new NotFoundException('Document not found');
    }
    const doc = await this.documentsService.getByPath(workspaceId, path);
    return this.toFull(doc);
  }

  private toFull(doc: DocumentEntityDocument) {
    // Documents are publicly addressed by filePath — never expose the Mongo _id.
    // updatedBy is resolved to the author's name (populated), never a raw id.
    const author = doc.updatedBy as unknown as { name?: string } | null;
    return {
      filePath: doc.filePath,
      title: doc.title,
      contentRaw: doc.contentRaw,
      contentHtml: doc.contentHtml,
      metadata: doc.metadata,
      links: doc.links,
      updatedBy: author?.name ?? null,
    };
  }
}
