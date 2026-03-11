import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    statusCode: number;
    timestamp: string;
    path: string;
    details?: any;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly winstonLogger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        details = (exceptionResponse as any).details;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      details = exception.stack;
    }

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        message,
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(details && process.env.NODE_ENV !== 'production' && { details }),
      },
    };

    // Log the error
    const logMessage = `${request.method} ${request.url} - ${status} - ${message}`;
    
    if (status >= 500) {
      this.winstonLogger.error(logMessage, {
        context: 'AllExceptionsFilter',
        exception: exception instanceof Error ? exception.stack : exception,
        userId: (request as any).user?.userId,
        ip: request.ip,
      });
    } else {
      this.winstonLogger.warn(logMessage, {
        context: 'AllExceptionsFilter',
        userId: (request as any).user?.userId,
        ip: request.ip,
      });
    }

    response.status(status).json(errorResponse);
  }
}
