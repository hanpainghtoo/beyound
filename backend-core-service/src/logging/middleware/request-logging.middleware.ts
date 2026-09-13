import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { LoggingService } from '../logging.service';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private loggingService: LoggingService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl, headers } = req;
    const incomingCorrelationId = headers['x-correlation-id'];
    const correlationId =
      (Array.isArray(incomingCorrelationId)
        ? incomingCorrelationId[0]
        : incomingCorrelationId) || randomUUID();
    (req as Request & { correlationId: string }).correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;
      const user = (req as any).user;
      const userId = user?.id;
      const tenantId = user?.tenantId;

      this.loggingService.logApiRequest(
        method,
        originalUrl,
        statusCode,
        duration,
        userId,
        tenantId,
        correlationId,
      );

      if (duration > 1000) {
        this.loggingService.warn(
          `Slow request: ${method} ${originalUrl} took ${duration}ms correlationId=${correlationId}`,
          'Performance',
        );
      }

      if (statusCode >= 400) {
        this.loggingService.error(
          `HTTP Error: ${method} ${originalUrl} - ${statusCode} correlationId=${correlationId}`,
          undefined,
          'HTTP',
        );
      }
    });

    next();
  }
}
