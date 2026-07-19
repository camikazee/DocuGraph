import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { ErrorLogService } from '../../error-log/error-log.service';

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  requestId?: string;
}

/**
 * Globalny filtr wyjątków — wszystkie błędy zwracane w spójnym kształcie:
 * { statusCode, message, error, path, timestamp }.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * `errorLog` jest opcjonalny: w produkcji wstrzykiwany przez `main.ts`
   * (lokalny dziennik błędów), w testach filtr tworzony jako `new` bez niego.
   */
  constructor(private readonly errorLog?: ErrorLogService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? exception.name;
      }
    }

    const requestId = (request as Request & { requestId?: string }).requestId;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} rid=${requestId ?? '-'}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      // Persist to the local error log (best-effort; never blocks the response).
      const req = request as Request & {
        workspaceId?: string;
        user?: { userId?: string };
      };
      void this.errorLog?.record({
        source: 'server',
        message:
          exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? (exception.stack ?? null) : null,
        method: request.method,
        path: request.url,
        statusCode: status,
        requestId: requestId ?? null,
        userAgent: (request.headers['user-agent'] as string) ?? null,
        workspaceId: req.workspaceId ?? null,
        userId: req.user?.userId ?? null,
      });
    }

    const responseBody: ErrorResponseBody = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    };

    response.status(status).json(responseBody);
  }
}
