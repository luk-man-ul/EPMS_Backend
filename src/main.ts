import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static files from uploads directory
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Enable CORS
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  // Get Winston logger
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('EMPS API')
    .setDescription('Employee Management and Project System API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('projects', 'Project management')
    .addTag('tasks', 'Task management')
    .addTag('tickets', 'Ticket management')
    .addTag('attendance', 'Attendance tracking')
    .addTag('leave', 'Leave management')
    .addTag('notifications', 'Notifications')
    .addTag('chat', 'Real-time chat')
    .addTag('files', 'File attachments')
    .addTag('health', 'Health check')
    .addTag('admin', 'Admin dashboard')
    .addTag('activities', 'Activity logs')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
  logger.log(`Swagger documentation available at: http://localhost:${port}/api-docs`, 'Bootstrap');
}
bootstrap();
