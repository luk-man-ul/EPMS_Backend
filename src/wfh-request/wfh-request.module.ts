import { Module } from '@nestjs/common';
import { WfhRequestController } from './wfh-request.controller';
import { WfhRequestService } from './wfh-request.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WfhRequestController],
  providers: [WfhRequestService],
  exports: [WfhRequestService],
})
export class WfhRequestModule {}
