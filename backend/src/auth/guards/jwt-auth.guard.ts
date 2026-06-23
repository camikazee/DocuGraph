import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Wymaga ważnego tokena JWT w nagłówku Authorization: Bearer. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
