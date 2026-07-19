import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

/** Uruchamia przepływ OAuth Slacka (redirect przy /login, walidacja przy /callback). */
@Injectable()
export class SlackAuthGuard extends AuthGuard('slack') {
  /** Przekazuje `?next=` jako OAuth `state`, by przetrwał round-trip do providera. */
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const next =
      typeof req.query.next === 'string' ? req.query.next : undefined;
    return next ? { state: next } : {};
  }
}
