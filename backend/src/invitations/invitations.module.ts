import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { Invitation, InvitationSchema } from './schemas/invitation.schema';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';
import { AuditModule } from '../audit/audit.module';
import { MailerModule } from '../common/mailer/mailer.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invitation.name, schema: InvitationSchema },
    ]),
    WorkspacesModule,
    UsersModule,
    AuditModule,
    MailerModule,
  ],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
