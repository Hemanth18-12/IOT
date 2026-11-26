import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SafeUser, UsersService } from '../users/users.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';

export interface LoginResponse {
  accessToken: string;
  expiresIn: string;
  user: SafeUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      this.logger.warn(`Failed login attempt for unknown email: ${normalizedEmail}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      this.logger.warn(`Failed login attempt for user: ${normalizedEmail}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const expiresIn = dto.rememberMe
      ? this.configService.get<string>('jwt.rememberExpiresIn') || '30d'
      : this.configService.get<string>('jwt.expiresIn') || '1d';

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, { expiresIn });
    this.logger.log(`User logged in: ${user.email}`);

    return {
      accessToken,
      expiresIn,
      user: this.usersService.toSafeUser(user),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from current password');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.usersService.updatePasswordHash(user.id, newHash);
    this.logger.log(`Password updated for user: ${user.email}`);
    return { message: 'Password updated successfully' };
  }
}
