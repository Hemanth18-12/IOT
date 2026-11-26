import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UsersService } from '../users/users.service';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Rejected unauthenticated Socket.IO connection (${client.id})`);
        client.disconnect(true);
        return;
      }

      const secret = this.configService.get<string>('jwt.secret');
      const payload = await this.jwtService.verifyAsync<{ sub: string; email: string }>(token, {
        secret,
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        this.logger.warn(`Rejected Socket.IO client with invalid user (${client.id})`);
        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;
      client.data.email = user.email;
      await client.join(`user:${user.id}`);
      await client.join('authenticated');
      this.logger.log(`WebSocket connected: ${user.email} (${client.id})`);
    } catch {
      this.logger.warn(`Rejected Socket.IO connection with invalid token (${client.id})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    if (client.data?.email) {
      this.logger.log(`WebSocket disconnected: ${client.data.email} (${client.id})`);
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }

    const headerAuth = client.handshake.headers?.authorization;
    if (typeof headerAuth === 'string' && headerAuth.startsWith('Bearer ')) {
      return headerAuth.slice(7).trim();
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.replace(/^Bearer\s+/i, '').trim();
    }

    return null;
  }

  emitTelemetryUpdate(payload: Record<string, unknown>): void {
    this.server?.to('authenticated').emit('telemetry:update', payload);
  }

  emitDeviceState(payload: Record<string, unknown>): void {
    this.server?.to('authenticated').emit('device:state', payload);
  }

  emitDeviceOnline(payload: Record<string, unknown>): void {
    this.server?.to('authenticated').emit('device:online', payload);
  }

  emitDeviceOffline(payload: Record<string, unknown>): void {
    this.server?.to('authenticated').emit('device:offline', payload);
  }

  emitSecurityAlert(payload: Record<string, unknown>): void {
    this.server?.to('authenticated').emit('security:alert', payload);
  }

  emitNotificationNew(userId: string, payload: Record<string, unknown>): void {
    this.server?.to(`user:${userId}`).emit('notification:new', payload);
  }

  emitCommandStatus(payload: Record<string, unknown>): void {
    this.server?.to('authenticated').emit('command:status', payload);
  }

  emitBuzzerState(payload: Record<string, unknown>): void {
    this.server?.to('authenticated').emit('buzzer:state', payload);
  }

  emitEmailStatus(payload: Record<string, unknown>): void {
    this.server?.to('authenticated').emit('email:status', payload);
  }
}
