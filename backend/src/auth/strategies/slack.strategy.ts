import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-oauth2';
import { OAuthProfile } from '../interfaces/oauth-profile.interface';

interface SlackUserInfo {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
  'https://slack.com/user_id'?: string;
}

/**
 * "Sign in with Slack" przez OpenID Connect. Po wymianie kodu pobieramy
 * profil z userInfo. Fallback pozwala aplikacji wstać bez konfiguracji.
 */
@Injectable()
export class SlackStrategy extends PassportStrategy(Strategy, 'slack') {
  private static readonly logger = new Logger(SlackStrategy.name);

  constructor(config: ConfigService) {
    const clientID = config.get<string>('slack.clientId') ?? '';
    const clientSecret = config.get<string>('slack.clientSecret') ?? '';
    const callbackURL = config.get<string>('slack.callbackUrl') ?? '';

    if (!clientID || !clientSecret) {
      SlackStrategy.logger.warn(
        'Slack OAuth nie jest skonfigurowany (brak SLACK_CLIENT_ID/SECRET).',
      );
    }

    super({
      authorizationURL: 'https://slack.com/openid/connect/authorize',
      tokenURL: 'https://slack.com/api/openid.connect.token',
      clientID: clientID || 'slack-not-configured',
      clientSecret: clientSecret || 'slack-not-configured',
      callbackURL: callbackURL || 'http://localhost/not-configured',
      scope: ['openid', 'email', 'profile'],
    });
  }

  async validate(accessToken: string): Promise<OAuthProfile> {
    const res = await fetch('https://slack.com/api/openid.connect.userInfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const info = (await res.json()) as SlackUserInfo;

    const email = info.email?.toLowerCase();
    if (!email) {
      throw new UnauthorizedException(
        'Slack account has no accessible email address',
      );
    }

    return {
      providerUserId: info.sub ?? info['https://slack.com/user_id'] ?? email,
      email,
      name: info.name ?? email,
      username: email,
      avatarUrl: info.picture ?? null,
    };
  }
}
