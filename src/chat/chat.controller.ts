import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('init-company-room')
  async initCompanyRoom() {
    await this.chatService.ensureCompanyRoom();
    return { message: 'Company room initialized successfully' };
  }

  @Post('rooms')
  async createRoom(@Body() createRoomDto: CreateRoomDto, @Request() req) {
    return this.chatService.createRoom(createRoomDto, req.user.id);
  }

  @Get('rooms')
  async getUserRooms(@Request() req) {
    return this.chatService.getUserRooms(req.user.id, req.user.role);
  }

  @Get('rooms/:roomId')
  async getRoom(@Param('roomId') roomId: string, @Request() req) {
    return this.chatService.getRoomById(roomId, req.user.id, req.user.role);
  }

  @Get('rooms/:roomId/messages')
  async getRoomMessages(
    @Param('roomId') roomId: string,
    @Query('limit') limit: string,
    @Request() req,
  ) {
    const messageLimit = limit ? parseInt(limit, 10) : 50;
    return this.chatService.getRoomMessages(roomId, req.user.id, req.user.role, messageLimit);
  }
}
