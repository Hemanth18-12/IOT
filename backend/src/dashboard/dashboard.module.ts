import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { DevicesModule } from '../devices/devices.module';
import { EventsModule } from '../events/events.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    DevicesModule,
    TelemetryModule,
    EventsModule,
    NotificationsModule,
    CommandsModule,
    MqttModule,
  ],
  controllers: [DashboardController],
})
export class DashboardModule {}
