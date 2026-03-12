import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttendanceSessionService } from './attendance-session.service';

@Injectable()
export class AttendanceSchedulerService {
  private readonly logger = new Logger(AttendanceSchedulerService.name);

  constructor(private readonly sessionService: AttendanceSessionService) {
    this.logger.log('AttendanceSchedulerService initialized');
  }

  /**
   * Midnight auto-checkout job
   * Runs every day at 23:59 (11:59 PM)
   * Closes all sessions that are still open from previous days
   */
  @Cron('59 23 * * *', {
    name: 'midnight-auto-checkout',
    timeZone: 'Asia/Kolkata', // Adjust to your timezone
  })
  async handleMidnightAutoCheckout() {
    this.logger.log('=== Midnight Auto-Checkout Job Triggered ===');
    try {
      const result = await this.sessionService.midnightAutoCheckout();
      this.logger.log(
        `Midnight auto-checkout completed successfully - ${result.sessionsClosed} sessions closed`
      );
    } catch (error) {
      this.logger.error('Midnight auto-checkout job failed', error.stack);
    }
  }

  /**
   * Auto-checkout long sessions job
   * Runs every hour to check for sessions exceeding max duration
   */
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'auto-checkout-long-sessions',
  })
  async handleAutoCheckoutLongSessions() {
    this.logger.log('=== Auto-Checkout Long Sessions Job Triggered ===');
    try {
      const result = await this.sessionService.autoCheckoutLongSessions();
      this.logger.log(
        `Auto-checkout long sessions completed - ${result.sessionsClosed} sessions closed`
      );
    } catch (error) {
      this.logger.error('Auto-checkout long sessions job failed', error.stack);
    }
  }
}
