import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketWorkflowService } from './ticket-workflow.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsModule } from '../comments/comments.module';

@Module({
  imports: [CommentsModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketWorkflowService, PrismaService],
})
export class TicketsModule {}