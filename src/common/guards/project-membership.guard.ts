import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProjectMembershipGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Admins bypass membership check
    if (user.role === 'ADMIN') {
      return true;
    }

    // Extract projectId from request body or params
    const projectId = request.body?.projectId || request.params?.projectId;

    if (!projectId) {
      throw new ForbiddenException('Project ID is required');
    }

    // Check if user is a member of the project
    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You must be a member of this project to create self-work tasks',
      );
    }

    return true;
  }
}
