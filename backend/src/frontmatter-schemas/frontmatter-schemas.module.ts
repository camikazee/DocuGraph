import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { FrontmatterSchemasController } from './frontmatter-schemas.controller';
import { FrontmatterSchemasService } from './frontmatter-schemas.service';
import {
  FrontmatterSchema,
  FrontmatterSchemaSchema,
} from './schemas/frontmatter-schema.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FrontmatterSchema.name, schema: FrontmatterSchemaSchema },
    ]),
    AuthModule,
    WorkspacesModule,
  ],
  controllers: [FrontmatterSchemasController],
  providers: [FrontmatterSchemasService],
})
export class FrontmatterSchemasModule {}
