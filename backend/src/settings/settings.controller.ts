import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SafeUser } from '../users/users.service';
import { TestEmailDto, UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user alert preferences and safe connection diagnostics' })
  getSettings(@CurrentUser() user: SafeUser) {
    return this.settingsService.getSettingsView(user);
  }

  @Patch()
  @ApiOperation({ summary: 'Update notification preferences, thresholds, and device name' })
  updateSettings(@CurrentUser() user: SafeUser, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(user, dto);
  }

  @Post('test-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test SMTP email and return delivery acceptance status' })
  sendTestEmail(@CurrentUser() user: SafeUser, @Body() dto: TestEmailDto) {
    return this.settingsService.sendTestEmail(user, dto);
  }

  @Post('verify-smtp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run Nodemailer transporter.verify() against configured SMTP server' })
  verifySmtp() {
    return this.settingsService.verifySmtpConnection();
  }
}
