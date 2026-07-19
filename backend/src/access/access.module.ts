import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Group, GroupSchema } from './schemas/group.schema';
import { AccessRule, AccessRuleSchema } from './schemas/access-rule.schema';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Group.name, schema: GroupSchema },
      { name: AccessRule.name, schema: AccessRuleSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule, // JwtAuthGuard
    WorkspacesModule, // WorkspaceGuard + resolveUserId/findMembership
  ],
  controllers: [AccessController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
