import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { MediaService } from './media.service';

/**
 * Publiczne serwowanie assetów po nieodgadywalnym URL-u (capability URL:
 * uuid workspace + uuid assetu). Pozwala osadzać obrazy w markdownie tak, by
 * renderowały się jako <img> (przeglądarka nie wyśle nagłówka Bearer).
 */
@Controller('public/workspaces/:wsUuid/assets')
export class MediaPublicController {
  constructor(
    private readonly media: MediaService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Get(':assetUuid')
  async serve(
    @Param('wsUuid') wsUuid: string,
    @Param('assetUuid') assetUuid: string,
    @Res() res: Response,
  ): Promise<void> {
    const internal = await this.workspaces.resolveId(wsUuid);
    if (!internal) throw new NotFoundException('Asset not found');
    const { buffer, mimeType, name } = await this.media.serve(
      internal,
      assetUuid,
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Asset jest osadzalny międzydomenowo (np. <img> w dokumentacji).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buffer);
  }
}
