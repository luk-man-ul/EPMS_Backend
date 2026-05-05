import { Module } from '@nestjs/common';
import { WfhRequestController } from './wfh-request.controller';
import { WfhRequestService } from './wfh-request.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [WfhRequestController],
  providers: [WfhRequestService],
  exports: [WfhRequestService],
})
export class WfhRequestModule {}
