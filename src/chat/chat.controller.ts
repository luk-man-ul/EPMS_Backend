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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateRoomDto } from './dto/create-room.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('init-company-room')
  @ApiOperation({ summary: 'Initialize the company-wide chat room' })
  @ApiResponse({ status: 201, description: 'Company room initialized' })
  async initCompanyRoom() {
    await this.chatService.ensureCompanyRoom();
    return { message: 'Company room initialized successfully' };
  }

  @Post('rooms')
  @ApiOperation({ summary: 'Create a new chat room' })
  @ApiResponse({ status: 201, description: 'Chat room created' })
  async createRoom(@Body() createRoomDto: CreateRoomDto, @Request() req) {
    return this.chatService.createRoom(createRoomDto, req.user.id);
  }

  @Get('rooms')
  @ApiOperation({ summary: 'Get all chat rooms accessible to current user' })
  @ApiResponse({ status: 200, description: 'Returns list of chat rooms' })
  async getUserRooms(@Request() req) {
    return this.chatService.getUserRooms(req.user.id, req.user.role);
  }

  @Get('rooms/:roomId')
  @ApiOperation({ summary: 'Get a single chat room by ID' })
  @ApiParam({ name: 'roomId', description: 'Chat room UUID' })
  @ApiResponse({ status: 200, description: 'Returns chat room details' })
  async getRoom(@Param('roomId') roomId: string, @Request() req) {
    return this.chatService.getRoomById(roomId, req.user.id, req.user.role);
  }

  @Get('rooms/:roomId/messages')
  @ApiOperation({ summary: 'Get messages for a chat room' })
  @ApiParam({ name: 'roomId', description: 'Chat room UUID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of messages to return', example: 50 })
  @ApiResponse({ status: 200, description: 'Returns list of messages' })
  async getRoomMessages(
    @Param('roomId') roomId: string,
    @Query('limit') limit: string,
    @Request() req,
  ) {
    const messageLimit = limit ? parseInt(limit, 10) : 50;
    return this.chatService.getRoomMessages(roomId, req.user.id, req.user.role, messageLimit);
  }
}
