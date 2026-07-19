import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

/** Uruchamia przepływ OAuth GitHuba (redirect przy /login, walidacja przy /callback). */
@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  /** Przekazuje `?next=` jako OAuth `state`, by przetrwał round-trip do providera. */
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const next =
      typeof req.query.next === 'string' ? req.query.next : undefined;
    return next ? { state: next } : {};
  }
}
