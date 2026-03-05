import { Module } from '@nestjs/common'
import { TasksService } from './tasks.service'
import { TasksController } from './tasks.controller'
import { PrismaService } from 'src/prisma/prisma.service'
import { ProjectMembershipGuard } from '../common/guards/project-membership.guard'
import { ApprovalAuthorityGuard } from '../common/guards/approval-authority.guard'

@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    PrismaService,
    ProjectMembershipGuard,
    ApprovalAuthorityGuard,
  ],
})
export class TasksModule {}