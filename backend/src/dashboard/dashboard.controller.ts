import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommandsService } from '../commands/commands.service';
import { DevicesService } from '../devices/devices.service';
import { EventsService } from '../events/events.service';
import { MqttService } from '../mqtt/mqtt.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { SafeUser } from '../users/users.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly telemetryService: TelemetryService,
    private readonly eventsService: EventsService,
    private readonly notificationsService: NotificationsService,
    private readonly commandsService: CommandsService,
    private readonly mqttService: MqttService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get aggregated real-time overview for the SmartRoom dashboard' })
  @ApiQuery({ name: 'deviceId', required: false })
  async getOverview(
    @CurrentUser() user: SafeUser,
    @Query('deviceId') deviceId?: string,
  ) {
    const device = deviceId
      ? await this.devicesService.findOneByIdOrDeviceId(deviceId)
      : await this.devicesService.getDefaultDevice();

    const [
      securitySummary,
      recentEventsResult,
      telemetryHistory,
      unreadNotifications,
      recentCommands,
    ] = await Promise.all([
      this.eventsService.getTodaySecuritySummary(device.deviceId),
      this.eventsService.findEvents({ deviceId: device.deviceId, page: 1, limit: 10 }),
      this.telemetryService.getHistory({
        deviceId: device.deviceId,
        range: '1h',
        limit: 40,
      }),
      this.notificationsService.getUnreadCount(user.id),
      this.commandsService.findRecent(device.deviceId, 5),
    ]);

    return {
      device,
      mqttConnected: this.mqttService.isConnected(),
      alertsToday: securitySummary.alertsToday,
      lastSuccess: securitySummary.lastSuccess,
      lastUnauthorized: securitySummary.lastUnauthorized,
      latestAlert: securitySummary.latestAlert,
      recentActivity: recentEventsResult.items,
      recentTelemetry: telemetryHistory.items,
      recentCommands,
      unreadNotifications,
      serverTime: new Date().toISOString(),
    };
  }
}
