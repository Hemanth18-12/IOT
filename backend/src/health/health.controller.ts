import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as os from 'os';
import { DataSource } from 'typeorm';
import { MqttService } from '../mqtt/mqtt.service';

export function detectLocalLanIp(): string | null {
  const nets = os.networkInterfaces();
  const preferredOrder = ['en0', 'en1', 'wlan0', 'eth0', 'Wi-Fi', 'Ethernet'];

  for (const ifaceName of preferredOrder) {
    const entries = nets[ifaceName];
    if (!entries) continue;
    for (const addr of entries) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }

  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const addr of entries) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }

  return null;
}

@ApiTags('System')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly mqttService: MqttService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Backend, database, LAN IP, and MQTT broker health check' })
  async check() {
    let dbOk = false;
    try {
      await this.dataSource.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const lanIp = detectLocalLanIp();

    return {
      status: dbOk ? 'ok' : 'degraded',
      database: dbOk ? 'connected' : 'disconnected',
      mqttConnected: this.mqttService.isConnected(),
      lanIp,
      mobileUrl: lanIp ? `http://${lanIp}:5173` : null,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
