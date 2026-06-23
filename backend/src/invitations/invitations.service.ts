import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { generateToken, hashToken } from '../common/utils/token.util';
import { UsersService } from '../users/users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  Invitation,
  InvitationDocument,
  InvitationStatus,
} from './schemas/invitation.schema';

export interface CreatedInvitation {
  id: string;
  email: string;
  role: Role;
  /** Surowy token — zwracany TYLKO przy utworzeniu (do zbudowania linku). */
  token: string;
  expiresAt: Date;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class InvitationsService {
  constructor(
    @InjectModel(Invitation.name)
    private readonly invitationModel: Model<InvitationDocument>,
    private readonly workspacesService: WorkspacesService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  async create(
    workspaceId: string,
    invitedBy: string,
    email: string,
    role: Role,
  ): Promise<CreatedInvitation> {
    const { raw, hash } = generateToken();
    const ttlHours =
      this.config.get<number>('security.inviteTokenTtlHours') ?? 72;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const invitation = await this.invitationModel.create({
      workspaceId,
      email: email.toLowerCase(),
      role,
      tokenHash: hash,
      invitedBy,
      status: InvitationStatus.Pending,
      expiresAt,
    });

    return {
      id: invitation.uuid,
      email: invitation.email,
      role: invitation.role,
      token: raw,
      expiresAt,
    };
  }

  async listPending(workspaceId: string): Promise<PendingInvitation[]> {
    const invitations = await this.invitationModel
      .find({ workspaceId, status: InvitationStatus.Pending })
      .sort({ createdAt: -1 })
      .exec();

    return invitations.map((inv) => ({
      id: inv.uuid,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt,
      createdAt: inv.get('createdAt') as Date,
    }));
  }

  async revoke(workspaceId: string, invitationUuid: string): Promise<void> {
    const invitation = await this.invitationModel.findOne({
      uuid: invitationUuid,
      workspaceId,
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status === InvitationStatus.Pending) {
      invitation.status = InvitationStatus.Revoked;
      await invitation.save();
    }
  }

  /** Akceptacja zaproszenia przez zalogowanego usera. */
  async accept(
    token: string,
    userId: string,
  ): Promise<{ workspaceId: string }> {
    const invitation = await this.invitationModel.findOne({
      tokenHash: hashToken(token),
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== InvitationStatus.Pending) {
      throw new GoneException('Invitation is no longer valid');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      invitation.status = InvitationStatus.Expired;
      await invitation.save();
      throw new GoneException('Invitation has expired');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was issued for a different email address',
      );
    }

    const workspaceId = invitation.workspaceId.toString();
    await this.workspacesService.addMember(
      workspaceId,
      userId,
      invitation.role,
    );

    invitation.status = InvitationStatus.Accepted;
    await invitation.save();

    // Zwracamy publiczny uuid workspace (nie wewnętrzne _id).
    const workspaceUuid =
      (await this.workspacesService.getUuid(workspaceId)) ?? workspaceId;
    return { workspaceId: workspaceUuid };
  }
}
