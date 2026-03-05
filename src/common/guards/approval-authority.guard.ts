import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApprovalAuthorityGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Admins have universal approval authority
    if (user.role === 'ADMIN') {
      return true;
    }

    // Extract taskId from request params
    const taskId = request.params?.id;

    if (!taskId) {
      throw new ForbiddenException('Task ID is required');
    }

    // Fetch the task with project information
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Team Leads can approve tasks in projects they manage
    if (user.role === 'TEAM_LEAD') {
      if (task.project.leadId === user.id) {
        return true;
      }
    }

    throw new ForbiddenException(
      'You do not have permission to approve tasks for this project',
    );
  }
}
