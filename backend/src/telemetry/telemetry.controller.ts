import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TelemetryService } from './telemetry.service';

@ApiTags('Telemetry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('latest')
  @ApiOperation({ summary: 'Get latest hardware state and telemetry reading' })
  @ApiQuery({ name: 'deviceId', required: false })
  getLatest(@Query('deviceId') deviceId?: string) {
    return this.telemetryService.getLatest(deviceId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get historical sensor telemetry readings' })
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiQuery({ name: 'range', required: false, enum: ['1h', 'today', '24h', '7d', '30d'] })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getHistory(
    @Query('deviceId') deviceId?: string,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.telemetryService.getHistory({
      deviceId,
      range,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
