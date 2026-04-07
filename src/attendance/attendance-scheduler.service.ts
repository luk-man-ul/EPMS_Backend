import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceFinalizationService } from './attendance-finalization.service';

@Injectable()
export class AttendanceSchedulerService {
  private readonly logger = new Logger(AttendanceSchedulerService.name);

  constructor(
    private readonly sessionService: AttendanceSessionService,
    private readonly finalizationService: AttendanceFinalizationService,
  ) {
    this.logger.log('AttendanceSchedulerService initialized');
  }

  /**
   * Midnight auto-checkout + finalization job
   * Runs every day at 23:59 IST
   * Step 1: Close all open sessions for the day
   * Step 2: Finalize Attendance daily-summary rows
   */
  @Cron('59 23 * * *', {
    name: 'midnight-auto-checkout',
    timeZone: 'Asia/Kolkata',
  })
  async handleMidnightAutoCheckout() {
    this.logger.log('=== Midnight Auto-Checkout + Finalization Job Triggered ===');

    // Step 1: Close open sessions first so finalization sees complete data
    try {
      const checkoutResult = await this.sessionService.midnightAutoCheckout();
      this.logger.log(
        `Midnight auto-checkout completed — ${checkoutResult.sessionsClosed} sessions closed`,
      );
    } catch (error) {
      this.logger.error('Midnight auto-checkout job failed', error.stack);
      // Do not abort finalization if checkout fails — partial data is better than none
    }

    // Step 2: Finalize daily attendance summaries
    try {
      const finalizeResult = await this.finalizationService.finalizeDay();
      this.logger.log(
        `Attendance finalization completed — ` +
        `${finalizeResult.finalized} present/late/wfh, ${finalizeResult.absent} absent`,
      );
    } catch (error) {
      this.logger.error('Attendance finalization job failed', error.stack);
    }
  }

  /**
   * Auto-checkout long sessions job
   * Runs every hour to check for sessions exceeding max duration
   */
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'auto-checkout-long-sessions',
    timeZone: 'Asia/Kolkata',
  })
  async handleAutoCheckoutLongSessions() {
    this.logger.log('=== Auto-Checkout Long Sessions Job Triggered ===');
    try {
      const result = await this.sessionService.autoCheckoutLongSessions();
      this.logger.log(
        `Auto-checkout long sessions completed - ${result.sessionsClosed} sessions closed`,
      );
    } catch (error) {
      this.logger.error('Auto-checkout long sessions job failed', error.stack);
    }
  }
}
