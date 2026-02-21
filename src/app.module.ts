import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { PermissionGuard } from './common/guards/permission.guard'
import { JwtAuthGuard } from './auth/jwt-auth.guard'
import { UsersModule } from './users/users.module'
import { SkillsModule } from './skills/skills.module'
import { ProjectsModule } from './projects/projects.module'
import { PermissionsModule } from './permissions/permissions.module'
import { TasksModule } from './tasks/tasks.module';
import { TicketsModule } from './tickets/tickets.module';
import { TicketWorkflowService } from './tickets/ticket-workflow.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    SkillsModule,
    ProjectsModule,
    PermissionsModule,
    TasksModule,
    TicketsModule,
  ],
  controllers: [AppController],
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
export class AppModule {}
