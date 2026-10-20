import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { DomainError, ERROR_CATALOG } from '@deal/shared';

/**
 * Traduce errores a respuestas JSON estables `{ error: { code, message, hint, details } }`.
 * Los errores inesperados se registran y se devuelven sin detalles internos.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      res.status(exception.http).json({ error: exception.toJSON() });
      return;
    }
    if (exception instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid input data',
          hint: ERROR_CATALOG.VALIDATION_FAILED.hint,
          details: {
            issues: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
        },
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json({
        error: {
          code: status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
          message: exception.message,
        },
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal error' } });
  }
}
