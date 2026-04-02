import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

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
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
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
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,

    // 🔥 FIRST: JWT must run
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // 🔥 SECOND: Permission guard runs after JWT
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
