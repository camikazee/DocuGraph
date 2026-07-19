import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { SlackAuthGuard } from './guards/slack-auth.guard';
import { OAuthProfile } from './interfaces/oauth-profile.interface';

// Ostrzejszy limit na wrażliwych endpointach auth (brute-force / enumeracja).
// Czytany z env w czasie importu, więc testy mogą go nadpisać przed startem.
const AUTH_THROTTLE = {
  ttl: parseInt(process.env.AUTH_THROTTLE_TTL_MS ?? '60000', 10),
  limit: parseInt(process.env.AUTH_THROTTLE_LIMIT ?? '10', 10),
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Po udanym OAuth przekierowuje do frontendu z tokenem w fragmencie URL
   * (fragment nie trafia do logów serwera ani nagłówka Referer). `next` niesie
   * OAuth `state` — sanityzowany po stronie frontu (tylko ścieżki wewnętrzne).
   */
  private redirectWithToken(req: Request, res: Response, token: string): void {
    const appUrl = (
      this.config.get<string>('appUrl') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
    const frag = new URLSearchParams({ token });
    const state = req.query.state;
    if (typeof state === 'string' && state) frag.set('next', state);
    res.redirect(`${appUrl}/oauth#${frag.toString()}`);
  }

  @Post('register')
  @Throttle({ default: AUTH_THROTTLE })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: AUTH_THROTTLE })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot')
  @Throttle({ default: AUTH_THROTTLE })
  @HttpCode(200)
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset')
  @Throttle({ default: AUTH_THROTTLE })
  @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  // --- GitHub OAuth ---
  @Get('github/login')
  @UseGuards(GithubAuthGuard)
  githubLogin(): void {
    // Obsługiwane przez GithubAuthGuard (redirect).
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    const { accessToken } = await this.authService.loginWithOAuth(
      'github',
      req.user as OAuthProfile,
    );
    this.redirectWithToken(req, res, accessToken);
  }

  // --- Slack OAuth ---
  @Get('slack/login')
  @UseGuards(SlackAuthGuard)
  slackLogin(): void {
    // Obsługiwane przez SlackAuthGuard (redirect).
  }

  @Get('slack/callback')
  @UseGuards(SlackAuthGuard)
  async slackCallback(@Req() req: Request, @Res() res: Response) {
    const { accessToken } = await this.authService.loginWithOAuth(
      'slack',
      req.user as OAuthProfile,
    );
    this.redirectWithToken(req, res, accessToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.userId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.userId, dto);
  }
}
