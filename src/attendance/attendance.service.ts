import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AttendanceSessionService } from './attendance-session.service';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private sessionService: AttendanceSessionService,
  ) {}

  async checkIn(userId: string, latitude: number, longitude: number) {
    // Use session service for check-in with location validation
    return this.sessionService.checkIn(userId, latitude, longitude);
  }

  async checkOut(userId: string) {
    // Use session service for check-out
    return this.sessionService.checkOut(userId);
  }

  async findMyAttendance(userId: string) {
    // Delegate to session service
    return this.sessionService.getMySessions(userId);
  }

  async findTodayAttendance(userId: string) {
    // Use session service to get today's sessions
    return this.sessionService.getTodaySessions(userId);
  }

  async findAll(filters: any, user: any) {
    // Delegate to session service
    return this.sessionService.getAllSessions(filters, user);
  }

  async midnightAutoCheckout() {
    // Delegate to session service
    return this.sessionService.midnightAutoCheckout();
  }

  async autoCheckoutLongSessions() {
    // Delegate to session service
    return this.sessionService.autoCheckoutLongSessions();
  }

  private async getTeamMemberIds(teamLeadId: string): Promise<string[]> {
    const projects = await this.prisma.project.findMany({
      where: { leadId: teamLeadId },
      include: { members: { select: { userId: true } } },
    });

    const memberIds = new Set<string>();
    projects.forEach(project => {
      project.members.forEach(member => memberIds.add(member.userId));
    });

    return Array.from(memberIds);
  }
}
