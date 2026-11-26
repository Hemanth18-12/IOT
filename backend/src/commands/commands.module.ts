import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevicesModule } from '../devices/devices.module';
import { EventsModule } from '../events/events.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CommandsController } from './commands.controller';
import { CommandsService } from './commands.service';
import { Command } from './entities/command.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Command]),
    DevicesModule,
    EventsModule,
    RealtimeModule,
    forwardRef(() => MqttModule),
  ],
  controllers: [CommandsController],
  providers: [CommandsService],
  exports: [CommandsService],
})
export class CommandsModule {}
