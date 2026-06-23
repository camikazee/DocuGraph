import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') as string,
      // Tylko HS256 — blokuje ataki na podmianę algorytmu (np. alg:none).
      algorithms: ['HS256'],
    });
  }

  /** Zwracana wartość trafia do `req.user`. */
  validate(payload: JwtPayload): AuthenticatedUser {
    return { userId: payload.sub };
  }
}
