import { Injectable, NestMiddleware, Inject, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    // Log incoming request
    this.logger.log('info', `Incoming ${method} ${originalUrl}`, {
      context: 'RequestLogger',
      method,
      url: originalUrl,
      ip,
      userAgent,
    });

    // Log response when finished
    res.on('finish', () => {
      const { statusCode } = res;
      const responseTime = Date.now() - startTime;
      const userId = (req as any).user?.userId;

      const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

      this.logger.log(logLevel, `${method} ${originalUrl} ${statusCode} - ${responseTime}ms`, {
        context: 'RequestLogger',
        method,
        url: originalUrl,
        statusCode,
        responseTime,
        userId,
        ip,
      });
    });

    next();
  }
}
