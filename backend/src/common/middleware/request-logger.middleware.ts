import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Nadaje każdemu żądaniu identyfikator (z nagłówka `x-request-id` albo losowy),
 * odbija go w odpowiedzi i loguje access-log po zakończeniu: metoda, ścieżka,
 * status, czas i `rid`. Poziom logu zależy od kodu odpowiedzi (5xx→error,
 * 4xx→warn, reszta→log).
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const headerId = req.headers['x-request-id'];
    const id =
      (Array.isArray(headerId) ? headerId[0] : headerId) || randomUUID();
    req.requestId = id;
    res.setHeader('x-request-id', id);

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const msg = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms rid=${id}`;
      if (res.statusCode >= 500) this.logger.error(msg);
      else if (res.statusCode >= 400) this.logger.warn(msg);
      else this.logger.log(msg);
    });

    next();
  }
}
