import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-github2';
import { OAuthProfile } from '../interfaces/oauth-profile.interface';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private static readonly logger = new Logger(GithubStrategy.name);

  constructor(config: ConfigService) {
    const clientID = config.get<string>('github.clientId') ?? '';
    const clientSecret = config.get<string>('github.clientSecret') ?? '';
    const callbackURL = config.get<string>('github.callbackUrl') ?? '';

    if (!clientID || !clientSecret) {
      // Pozwalamy aplikacji wstać bez konfiguracji OAuth; logowanie GitHub
      // zwróci błąd dopiero przy próbie użycia.
      GithubStrategy.logger.warn(
        'GitHub OAuth nie jest skonfigurowany (brak GITHUB_CLIENT_ID/SECRET).',
      );
    }

    super({
      clientID: clientID || 'github-not-configured',
      clientSecret: clientSecret || 'github-not-configured',
      callbackURL: callbackURL || 'http://localhost/not-configured',
      scope: ['user:email'],
    });
  }

  /** Mapuje surowy profil GitHuba na nasz znormalizowany kształt. */
  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): OAuthProfile {
    const email = profile.emails?.[0]?.value?.toLowerCase();
    if (!email) {
      throw new UnauthorizedException(
        'GitHub account has no accessible email address',
      );
    }

    return {
      providerUserId: profile.id,
      email,
      name: profile.displayName || profile.username || email,
      username: profile.username ?? email,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };
  }
}
