import { Injectable, type LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import { redactSensitiveData } from './redaction.util';

@Injectable()
export class LoggingService implements LoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(
          ({ timestamp, level, message, context, trace, ...meta }) => {
            return JSON.stringify({
              timestamp,
              level,
              context,
              message,
              trace,
              ...meta,
            });
          },
        ),
      ),
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, context, message }) => {
              return `${timestamp} [${context}] ${level}: ${message}`;
            }),
          ),
        }),

        // File transport for all logs
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),

        // Error logs
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '30d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),

        // Security logs
        new DailyRotateFile({
          filename: 'logs/security-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '90d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    });
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    const safe = redactSensitiveData({ message, trace });
    this.logger.error(safe.message, { context, trace: safe.trace });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }

  // Security-specific logging
  logSecurityEvent(event: string, details: any, context?: string) {
    this.logger.info(`SECURITY: ${event}`, {
      context: context || 'Security',
      securityEvent: true,
      ...redactSensitiveData(details || {}),
    });
  }

  // Performance logging
  logPerformance(
    operation: string,
    duration: number,
    details?: any,
    context?: string,
  ) {
    this.logger.info(`PERFORMANCE: ${operation} completed in ${duration}ms`, {
      context: context || 'Performance',
      performanceLog: true,
      operation,
      duration,
      ...redactSensitiveData(details || {}),
    });
  }

  // API request logging
  logApiRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    userId?: string,
    tenantId?: string,
    correlationId?: string,
  ) {
    const sanitizedUrl = redactSensitiveData({ url }).url;
    this.logger.info(
      `API: ${method} ${sanitizedUrl} - ${statusCode} (${duration}ms)`,
      {
        context: 'API',
        method,
        url: sanitizedUrl,
        statusCode,
        duration,
        userId,
        tenantId,
        correlationId,
        apiRequest: true,
      },
    );
  }

  // Database operation logging
  logDatabaseOperation(
    operation: string,
    table: string,
    duration: number,
    details?: any,
  ) {
    this.logger.debug(`DB: ${operation} on ${table} (${duration}ms)`, {
      context: 'Database',
      operation,
      table,
      duration,
      databaseOperation: true,
      ...redactSensitiveData(details || {}),
    });
  }

  // WebSocket event logging
  logWebSocketEvent(
    event: string,
    userId?: string,
    tenantId?: string,
    details?: any,
  ) {
    this.logger.info(`WS: ${event}`, {
      context: 'WebSocket',
      event,
      userId,
      tenantId,
      websocketEvent: true,
      ...redactSensitiveData(details || {}),
    });
  }
}

export const Log = new LoggingService();
