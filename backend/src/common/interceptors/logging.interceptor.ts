import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - startedAt;
          this.logger.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
        },
        error: (err: unknown) => {
          const ms = Date.now() - startedAt;
          const status =
            err && typeof err === 'object' && 'status' in err
              ? Number((err as { status: unknown }).status)
              : 500;
          this.logger.warn(`${req.method} ${req.originalUrl} ${status} ${ms}ms`);
        },
      }),
    );
  }
}
