import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PermissionGuard } from './common/guards/permission.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { SkillsModule } from './skills/skills.module';
import { ProjectsModule } from './projects/projects.module';
import { PermissionsModule } from './permissions/permissions.module';
import { TasksModule } from './tasks/tasks.module';
import { TicketsModule } from './tickets/tickets.module';
import { TicketWorkflowService } from './tickets/ticket-workflow.service';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { WfhRequestModule } from './wfh-request/wfh-request.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { ChatModule } from './chat/chat.module';
import { FilesModule } from './files/files.module';
import { AdminModule } from './admin/admin.module';
import { LoggerModule } from './common/logger/logger.module';
import { CommentsModule } from './comments/comments.module';
import { FinanceModule } from './finance/finance.module';
import { HolidayModule } from './holiday/holiday.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),

    // ── Rate limiting ──────────────────────────────────────────────────────
    // Default throttle: 100 requests per 60 seconds — effectively no-op for
    // normal API usage. Individual endpoints override this with @Throttle().
    // The 'default' name must match the name used in @Throttle() decorators.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,   // 60 seconds (in milliseconds for v6+)
        limit: 100,   // 100 requests — permissive default, does not affect normal use
      },
    ]),

    LoggerModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    SkillsModule,
    ProjectsModule,
    PermissionsModule,
    TasksModule,
    TicketsModule,
    AttendanceModule,
    LeaveModule,
    WfhRequestModule,
    NotificationsModule,
    ActivityLogsModule,
    ChatModule,
    FilesModule,
    AdminModule,
    CommentsModule,
    FinanceModule,
    HolidayModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,

    // ── Guard execution order ──────────────────────────────────────────────
    // 1. ThrottlerGuard  — blocks brute-force before any auth or DB work
    // 2. JwtAuthGuard    — validates JWT token
    // 3. PermissionGuard — checks role/permission codes
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },

    TicketWorkflowService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
