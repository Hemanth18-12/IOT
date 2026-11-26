import { Controller, Get, Header, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EventsService } from './events.service';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List paginated and filtered security/activity events' })
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiQuery({ name: 'eventType', required: false })
  @ApiQuery({ name: 'authenticationMethod', required: false })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('deviceId') deviceId?: string,
    @Query('eventType') eventType?: string,
    @Query('authenticationMethod') authenticationMethod?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.eventsService.findEvents({
      deviceId,
      eventType,
      authenticationMethod,
      severity,
      search,
      from,
      to,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export filtered activity logs as CSV' })
  async exportCsv(
    @Res() res: Response,
    @Query('deviceId') deviceId?: string,
    @Query('eventType') eventType?: string,
    @Query('authenticationMethod') authenticationMethod?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const csv = await this.eventsService.exportCsv({
      deviceId,
      eventType,
      authenticationMethod,
      severity,
      search,
      from,
      to,
    });
    res.setHeader('Content-Disposition', 'attachment; filename="smartroom-activity-events.csv"');
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single event details' })
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }
}
