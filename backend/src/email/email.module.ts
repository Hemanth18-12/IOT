import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailLog } from './entities/email-log.entity';
import { EmailService } from './email.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmailLog]), RealtimeModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
