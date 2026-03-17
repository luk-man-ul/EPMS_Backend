import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSockets: Map<string, string> = new Map(); // userId -> socketId
  private userRoles: Map<string, string> = new Map(); // userId -> role

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    try {
      const userId = client.handshake.query.userId as string;
      const userRole = client.handshake.query.userRole as string;
      
      if (!userId) {
        this.logger.warn(`Connection rejected: No userId provided - Socket ${client.id}`);
        client.emit('error', { message: 'Authentication required: userId not provided' });
        client.disconnect();
        return;
      }

      this.userSockets.set(userId, client.id);
      if (userRole) {
        this.userRoles.set(userId, userRole);
      }
      this.logger.log(`User ${userId} (${userRole || 'unknown role'}) connected with socket ${client.id}`);
    } catch (error) {
      this.logger.error(`Connection error for socket ${client.id}:`, error);
      client.emit('error', { message: 'Connection failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    try {
      // Remove user from maps
      for (const [userId, socketId] of this.userSockets.entries()) {
        if (socketId === client.id) {
          this.userSockets.delete(userId);
          this.userRoles.delete(userId);
          this.logger.log(`User ${userId} disconnected - Socket ${client.id}`);
          break;
        }
      }
    } catch (error) {
      this.logger.error(`Disconnect error for socket ${client.id}:`, error);
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; userId: string },
  ) {
    try {
      const { roomId, userId } = data;

      if (!roomId || !userId) {
        this.logger.warn(`Join room failed: Missing roomId or userId - Socket ${client.id}`);
        client.emit('error', { message: 'roomId and userId are required' });
        return { success: false, error: 'Missing required fields' };
      }

      // Admins can join any room; others must be members
      const userRole = this.userRoles.get(userId) || 'EMPLOYEE';
      const isMember =
        userRole === 'ADMIN' ||
        (await this.chatService.verifyRoomMembership(roomId, userId));

      if (!isMember) {
        this.logger.warn(`Join room denied: User ${userId} not a member of room ${roomId}`);
        client.emit('error', { message: 'You are not a member of this room' });
        return { success: false, error: 'Access denied' };
      }

      // Join the room
      client.join(roomId);
      this.logger.log(`User ${userId} joined room ${roomId}`);

      // Notify others in the room
      client.to(roomId).emit('userJoined', {
        userId,
        roomId,
        timestamp: new Date(),
      });

      return { success: true, roomId };
    } catch (error) {
      this.logger.error(`Error joining room - Socket ${client.id}:`, error);
      client.emit('error', { message: 'Failed to join room' });
      return { success: false, error: 'Internal error' };
    }
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; userId: string },
  ) {
    try {
      const { roomId, userId } = data;

      if (!roomId || !userId) {
        this.logger.warn(`Leave room failed: Missing roomId or userId - Socket ${client.id}`);
        return { success: false, error: 'Missing required fields' };
      }

      client.leave(roomId);
      this.logger.log(`User ${userId} left room ${roomId}`);

      // Notify others in the room
      client.to(roomId).emit('userLeft', {
        userId,
        roomId,
        timestamp: new Date(),
      });

      return { success: true, roomId };
    } catch (error) {
      this.logger.error(`Error leaving room - Socket ${client.id}:`, error);
      return { success: false, error: 'Internal error' };
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendMessageDto & { userId: string },
  ) {
    try {
      const { roomId, content, userId } = data;

      if (!roomId || !content || !userId) {
        this.logger.warn(`Send message failed: Missing required fields - Socket ${client.id}`);
        client.emit('error', { message: 'roomId, content, and userId are required' });
        return { success: false, error: 'Missing required fields' };
      }

      // Get user role from stored map
      const userRole = this.userRoles.get(userId) || 'EMPLOYEE';

      // Create message in database
      const message = await this.chatService.createMessage(roomId, userId, userRole, content);

      // Broadcast to all users in the room (including sender)
      this.server.to(roomId).emit('receiveMessage', message);

      this.logger.log(`Message sent in room ${roomId} by user ${userId}`);

      return { success: true, message };
    } catch (error) {
      this.logger.error(`Error sending message - Socket ${client.id}:`, error);
      client.emit('error', { message: error.message || 'Failed to send message' });
      return { success: false, error: error.message || 'Internal error' };
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; userId: string; isTyping: boolean },
  ) {
    try {
      const { roomId, userId, isTyping } = data;

      if (!roomId || !userId || typeof isTyping !== 'boolean') {
        this.logger.warn(`Typing indicator failed: Invalid data - Socket ${client.id}`);
        return;
      }

      // Broadcast typing indicator to others in the room (not to sender)
      client.to(roomId).emit('typingIndicator', {
        userId,
        roomId,
        isTyping,
      });
    } catch (error) {
      this.logger.error(`Error handling typing indicator - Socket ${client.id}:`, error);
    }
  }
}
