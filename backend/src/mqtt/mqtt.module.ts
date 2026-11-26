import { Module, forwardRef } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { DevicesModule } from '../devices/devices.module';
import { EventsModule } from '../events/events.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SettingsModule } from '../settings/settings.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { MqttService } from './mqtt.service';

@Module({
  imports: [
    DevicesModule,
    TelemetryModule,
    EventsModule,
    SettingsModule,
    RealtimeModule,
    forwardRef(() => CommandsModule),
  ],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
