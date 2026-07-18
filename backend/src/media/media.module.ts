import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import {
  DocumentEntity,
  DocumentSchema,
} from '../documents/schemas/document.schema';
import { Volume, VolumeSchema } from './schemas/volume.schema';
import { Asset, AssetSchema } from './schemas/asset.schema';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { MediaPublicController } from './media-public.controller';
import { ProviderFactory } from './providers/provider.factory';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Volume.name, schema: VolumeSchema },
      { name: Asset.name, schema: AssetSchema },
      { name: DocumentEntity.name, schema: DocumentSchema },
    ]),
    AuthModule, // JwtService (CombinedAuthGuard)
    WorkspacesModule, // WorkspacesService
    ApiKeysModule, // ApiKeysService
  ],
  controllers: [MediaController, MediaPublicController],
  providers: [MediaService, ProviderFactory],
  exports: [MediaService],
})
export class MediaModule {}
