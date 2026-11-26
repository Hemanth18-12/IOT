import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SafeUser } from '../users/users.service';
import { CommandsService } from './commands.service';
import { DoorCommandDto } from './dto/command.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CommandsController {
  constructor(private readonly commandsService: CommandsService) {}

  @Post('devices/:id/unlock')
  @ApiTags('Devices')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Send authenticated remote UNLOCK command to hardware' })
  unlockDoor(
    @Param('id') id: string,
    @Body() dto: DoorCommandDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.commandsService.issueDoorCommand(
      id,
      'UNLOCK',
      user,
      dto?.confirmed !== false,
    );
  }

  @Post('devices/:id/lock')
  @ApiTags('Devices')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiOperation({ summary: 'Send authenticated remote LOCK command to hardware' })
  lockDoor(
    @Param('id') id: string,
    @Body() dto: DoorCommandDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.commandsService.issueDoorCommand(
      id,
      'LOCK',
      user,
      dto?.confirmed !== false,
    );
  }

  @Get('commands/:id')
  @ApiTags('Commands')
  @ApiOperation({ summary: 'Poll command acknowledgment status' })
  getCommand(@Param('id') id: string) {
    return this.commandsService.findById(id);
  }
}
