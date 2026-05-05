import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from './notifications.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private userSockets = new Map<string, string>(); // userId → socketId

  constructor(
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
  ) {
    // Register this gateway with the service so it can push notifications
    this.notificationsService.gateway = this;
  }

  handleConnection(@ConnectedSocket() client: Socket) {
    try {
      const token = client.handshake.auth?.token;

      if (!token) {
        this.logger.warn(`Connection rejected: No token provided - Socket ${client.id}`);
        client.emit('error', { message: 'Authentication required: token not provided' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(`Connection rejected: Invalid token payload - Socket ${client.id}`);
        client.disconnect();
        return;
      }

      // Store userId in socket data for later use
      client.data.userId = userId;
      this.userSockets.set(userId, client.id);

      this.logger.log(`User ${userId} connected to notifications - Socket ${client.id}`);
    } catch (error) {
      this.logger.error(`Connection error for socket ${client.id}:`, error);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    try {
      const userId = client.data.userId;
      if (userId) {
        this.userSockets.delete(userId);
        this.logger.log(`User ${userId} disconnected from notifications - Socket ${client.id}`);
      }
    } catch (error) {
      this.logger.error(`Disconnect error for socket ${client.id}:`, error);
    }
  }

  /**
   * Push a notification to a specific user in real-time.
   * If the user is not connected, this is a no-op (notification is already persisted in DB).
   */
  pushToUser(userId: string, notification: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('notification', notification);
      this.logger.debug(`Pushed notification to user ${userId} via socket ${socketId}`);
    } else {
      this.logger.debug(`User ${userId} not connected — notification persisted only`);
    }
  }
}
