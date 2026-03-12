import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceSchedulerService } from './attendance-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceSessionService,
    AttendanceSchedulerService,
  ],
  exports: [AttendanceService, AttendanceSessionService],
})
export class AttendanceModule {}
