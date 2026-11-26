import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('temperature')
  @ApiOperation({ summary: 'Get temperature and ultrasonic distance trend analytics' })
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiQuery({ name: 'range', required: false, enum: ['1h', 'today', '7d', '30d'] })
  getTemperature(
    @Query('deviceId') deviceId?: string,
    @Query('range') range?: string,
  ) {
    return this.analyticsService.getTemperatureAnalytics(deviceId, range);
  }

  @Get('security')
  @ApiOperation({ summary: 'Get authentication and intrusion attempt analytics' })
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiQuery({ name: 'range', required: false, enum: ['1h', 'today', '7d', '30d'] })
  getSecurity(
    @Query('deviceId') deviceId?: string,
    @Query('range') range?: string,
  ) {
    return this.analyticsService.getSecurityAnalytics(deviceId, range);
  }

  @Get('device-usage')
  @ApiOperation({ summary: 'Calculate fan, LED, door, and buzzer duration from state changes' })
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiQuery({ name: 'range', required: false, enum: ['1h', 'today', '7d', '30d'] })
  getDeviceUsage(
    @Query('deviceId') deviceId?: string,
    @Query('range') range?: string,
  ) {
    return this.analyticsService.getDeviceUsageAnalytics(deviceId, range);
  }
}
