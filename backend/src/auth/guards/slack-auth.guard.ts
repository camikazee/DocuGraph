import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Uruchamia przepływ OAuth Slacka (redirect przy /login, walidacja przy /callback). */
@Injectable()
export class SlackAuthGuard extends AuthGuard('slack') {}
