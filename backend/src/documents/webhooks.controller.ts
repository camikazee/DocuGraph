import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { IncomingMessage } from 'http';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DocumentsService } from './documents.service';

/**
 * Publiczny odbiornik webhooków GitHuba (bez auth — uwierzytelnia sygnatura).
 * URL: POST /api/v1/workspaces/:wsUuid/hooks/github
 * Weryfikuje nagłówek `X-Hub-Signature-256` (HMAC-SHA256 surowego ciała
 * sekretem workspace'u), a po udanym `push` przeindeksowuje źródło.
 */
@Controller('workspaces/:wsUuid/hooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly documentsService: DocumentsService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Post('github')
  @HttpCode(200)
  async github(
    @Param('wsUuid') wsUuid: string,
    @Req() req: IncomingMessage & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
  ) {
    const workspaceId = await this.workspacesService.resolveId(wsUuid);
    if (!workspaceId) throw new NotFoundException('Workspace not found');

    const secret = await this.workspacesService.getWebhookSecret(workspaceId);
    if (!secret) {
      // Webhooki nie są włączone dla tego workspace'u — nie zdradzamy szczegółów.
      throw new NotFoundException('Webhooks are not enabled');
    }

    const raw = req.rawBody;
    if (!raw || !signature) {
      throw new BadRequestException('Missing signature or body');
    }
    if (!this.verify(raw, secret, signature)) {
      throw new UnauthorizedException('Signature mismatch');
    }

    // GitHub wysyła `ping` przy konfiguracji webhooka.
    if (event === 'ping') return { ok: true, pong: true };

    // Reagujemy tylko na `push`; inne zdarzenia kwitujemy bez akcji.
    if (event !== 'push') return { ok: true, ignored: event ?? 'unknown' };

    // Sygnatura jest poprawna — potwierdzamy odbiór (2xx) niezależnie od wyniku
    // reindeksu, by nieosiągalny GitHub API nie wywołał lawiny ponownych dostaw.
    const source = await this.workspacesService.getSource(workspaceId);
    const token = await this.workspacesService.getImportToken(workspaceId);
    try {
      const result = await this.documentsService.indexSource(
        workspaceId,
        source,
        null,
        token,
      );
      await this.workspacesService.markIndexed(workspaceId);
      return { ok: true, reindexed: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reindex failed';
      this.logger.warn(`Webhook reindex failed for ${wsUuid}: ${message}`);
      return { ok: true, reindexed: false, error: message };
    }
  }

  private verify(body: Buffer, secret: string, signature: string): boolean {
    const expected =
      'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
