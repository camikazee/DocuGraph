import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CombinedAuthGuard } from '../common/guards/combined-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestWithWorkspace } from '../common/interfaces/request-with-workspace.interface';
import { MediaService } from './media.service';
import {
  CreateVolumeDto,
  MoveAssetDto,
  RenameAssetDto,
  TestVolumeDto,
} from './dto/volume.dto';

const MAX_UPLOAD = 50 * 1024 * 1024; // 50 MB

@Controller('workspaces/:id')
@UseGuards(CombinedAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  private userId(req: RequestWithWorkspace): string | null {
    return req.authType === 'jwt' ? req.user.userId : null;
  }

  // ---- Volumes ----
  @Get('volumes')
  listVolumes(@Param('id') ws: string) {
    return this.media.listVolumes(ws);
  }

  @Post('volumes')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  createVolume(
    @Param('id') ws: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: CreateVolumeDto,
  ) {
    return this.media.createVolume(ws, this.userId(req), dto);
  }

  @Post('volumes/test')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  testConfig(@Body() dto: TestVolumeDto) {
    return this.media.testConfig(dto);
  }

  @Post('volumes/:volumeUuid/test')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  testVolume(@Param('id') ws: string, @Param('volumeUuid') v: string) {
    return this.media.testVolume(ws, v);
  }

  @Post('volumes/:volumeUuid/reconnect')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  reconnect(@Param('id') ws: string, @Param('volumeUuid') v: string) {
    return this.media.testVolume(ws, v);
  }

  @Delete('volumes/:volumeUuid')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  deleteVolume(@Param('id') ws: string, @Param('volumeUuid') v: string) {
    return this.media.deleteVolume(ws, v);
  }

  // ---- Assets ----
  @Get('assets/overview')
  overview(@Param('id') ws: string) {
    return this.media.overview(ws);
  }

  @Get('assets')
  listAssets(
    @Param('id') ws: string,
    @Query('filter') filter?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.listAssets(ws, filter, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('assets')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD } }),
  )
  upload(
    @Param('id') ws: string,
    @Req() req: RequestWithWorkspace,
    @UploadedFile() file: Express.Multer.File,
    @Body('volumeId') volumeId?: string,
  ) {
    return this.media.upload(ws, this.userId(req), volumeId, file);
  }

  @Get('assets/:assetUuid')
  async serve(
    @Param('id') ws: string,
    @Param('assetUuid') asset: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, name } = await this.media.serve(ws, asset);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buffer);
  }

  @Patch('assets/:assetUuid')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  rename(
    @Param('id') ws: string,
    @Param('assetUuid') asset: string,
    @Body() dto: RenameAssetDto,
  ) {
    return this.media.rename(ws, asset, dto.name);
  }

  @Post('assets/:assetUuid/move')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  moveAsset(
    @Param('id') ws: string,
    @Param('assetUuid') asset: string,
    @Body() dto: MoveAssetDto,
  ) {
    return this.media.move(ws, asset, dto.volumeId);
  }

  @Delete('assets/:assetUuid')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  remove(@Param('id') ws: string, @Param('assetUuid') asset: string) {
    return this.media.remove(ws, asset);
  }
}
