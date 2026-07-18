import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { MailerService } from '../common/mailer/mailer.service';
import { generateToken, hashToken } from '../common/utils/token.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthProfile } from './interfaces/oauth-profile.interface';

/** Stała odpowiedź dla „forgot" — nie ujawnia, czy konto istnieje. */
const FORGOT_RESPONSE = {
  message:
    'If an account exists for that email, a password reset link has been sent.',
};

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  username: string | null;
  bio: string | null;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly workspacesService: WorkspacesService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const rounds = this.config.get<number>('security.bcryptRounds') ?? 12;
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.usersService.create({
      email,
      name: dto.name,
      passwordHash,
    });

    // Każdy nowy user dostaje własny workspace, w którym jest właścicielem.
    await this.workspacesService.createWithOwner(
      user._id,
      `${dto.name}'s Workspace`,
    );

    return this.buildAuthResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    // Stały komunikat niezależnie od przyczyny — nie ujawniamy, czy email istnieje.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResult(user);
  }

  /**
   * Logowanie/rejestracja przez dowolnego dostawcę OAuth (GitHub, Slack).
   * Tożsamością jest e-mail:
   * - jeśli user istnieje → dopinamy providera (scalanie kont),
   * - jeśli nie → tworzymy konto bez hasła + workspace właściciela.
   */
  async loginWithOAuth(
    provider: 'github' | 'slack',
    profile: OAuthProfile,
  ): Promise<AuthResult> {
    const oauthProvider = {
      provider,
      providerUserId: profile.providerUserId,
      username: profile.username,
    };

    const existing = await this.usersService.findByEmail(profile.email);
    if (existing) {
      const user = await this.usersService.addAuthProvider(
        existing,
        oauthProvider,
      );
      return this.buildAuthResult(user);
    }

    const user = await this.usersService.create({
      email: profile.email,
      name: profile.name,
      passwordHash: null,
      avatarUrl: profile.avatarUrl,
      authProviders: [oauthProvider],
    });
    await this.workspacesService.createWithOwner(
      user._id,
      `${profile.name}'s Workspace`,
    );
    return this.buildAuthResult(user);
  }

  /**
   * Inicjuje reset hasła. Zawsze zwraca tę samą odpowiedź (brak enumeracji
   * kont). Gdy konto istnieje, generuje jednorazowy token (hash w bazie) i
   * wysyła link mailem. Dostarczanie przez SMTP to świadoma luka — patrz
   * MailerService / docs/TODO.md.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email.toLowerCase());
    if (user) {
      const { raw, hash } = generateToken();
      const ttlHours =
        this.config.get<number>('security.passwordResetTtlHours') ?? 1;
      const expires = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
      await this.usersService.setResetToken(user._id.toString(), hash, expires);

      const appUrl =
        this.config.get<string>('appUrl') ?? 'http://localhost:3001';
      const link = `${appUrl.replace(/\/+$/, '')}/reset-password?token=${raw}`;
      await this.mailer.sendPasswordReset(user.email, raw, link);
    }
    return FORGOT_RESPONSE;
  }

  /**
   * Kończy reset: weryfikuje token (hash + wygaśnięcie), ustawia nowe hasło i
   * unieważnia token (jednorazowość). Komunikat błędu jest jednolity.
   */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findByResetTokenHash(hashToken(token));
    const expires = user?.passwordResetExpires?.getTime() ?? 0;
    if (!user || expires < Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const rounds = this.config.get<number>('security.bcryptRounds') ?? 12;
    const passwordHash = await bcrypt.hash(newPassword, rounds);
    await this.usersService.setPassword(user._id.toString(), passwordHash);

    return { message: 'Password updated. You can now sign in.' };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    const workspaces = await this.workspacesService.listForUser(user._id);
    return {
      user: this.toPublicUser(user),
      workspaces: workspaces.map(({ workspace, role }) => ({
        id: workspace.uuid,
        name: workspace.name,
        slug: workspace.slug,
        role,
      })),
    };
  }

  private buildAuthResult(user: UserDocument): AuthResult {
    const accessToken = this.jwtService.sign({ sub: user._id.toString() });
    return { accessToken, user: this.toPublicUser(user) };
  }

  private toPublicUser(user: UserDocument): PublicUser {
    return {
      id: user.uuid,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      username: user.username ?? null,
      bio: user.bio ?? null,
    };
  }

  /** Aktualizacja własnego profilu (nazwa, uchwyt, bio, avatar). */
  async updateProfile(
    userId: string,
    data: {
      name?: string;
      username?: string;
      bio?: string;
      avatarUrl?: string;
    },
  ) {
    const updated = await this.usersService.updateProfile(userId, data);
    if (!updated) {
      throw new UnauthorizedException();
    }
    return this.getProfile(userId);
  }
}
