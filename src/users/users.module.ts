import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  providers: [UsersService],
  controllers: [UsersController]
})
export class UsersModule {}
