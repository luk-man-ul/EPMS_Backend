import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${context || 'Application'}] ${level}: ${message} ${metaStr}`;
  }),
);

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: consoleFormat,
          level: process.env.LOG_LEVEL || 'info',
        }),
        // File transport for errors
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: logFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        // File transport for all logs
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: logFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
      ],
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
