import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketWorkflowService } from './ticket-workflow.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsModule } from '../comments/comments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CommentsModule, NotificationsModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketWorkflowService, PrismaService],
})
export class TicketsModule {}
