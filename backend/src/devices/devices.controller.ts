import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevicesService } from './devices.service';

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @ApiOperation({ summary: 'List all registered SmartRoom hardware nodes' })
  findAll() {
    return this.devicesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get device details and current hardware state' })
  findOne(@Param('id') id: string) {
    return this.devicesService.findOneByIdOrDeviceId(id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get latest device connectivity and sensor/actuator status' })
  async getStatus(@Param('id') id: string) {
    const device = await this.devicesService.findOneByIdOrDeviceId(id);
    return {
      id: device.id,
      deviceId: device.deviceId,
      name: device.name,
      online: device.online,
      stale: device.stale,
      lastSeen: device.lastSeen,
      firmwareVersion: device.firmwareVersion,
      state: device.state,
    };
  }
}
