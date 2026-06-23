import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Uruchamia przepływ OAuth GitHuba (redirect przy /login, walidacja przy /callback). */
@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {}
