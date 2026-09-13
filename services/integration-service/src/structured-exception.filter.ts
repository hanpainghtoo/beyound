import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class StructuredExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { correlationId?: string }>();
    const response = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'integration-service',
        event: 'http_request_failed',
        correlationId: request.correlationId,
        method: request.method,
        path: request.originalUrl,
        statusCode: status,
        errorType: exception instanceof Error ? exception.name : typeof exception,
        message: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error && status >= 500 ? exception.stack : undefined,
      }),
    );

    response.status(status).json(this.responseBody(payload, status, request.correlationId));
  }

  private responseBody(payload: string | object, statusCode: number, correlationId?: string) {
    return typeof payload === 'string'
      ? { statusCode, message: payload, correlationId }
      : { ...payload, correlationId };
  }
}
