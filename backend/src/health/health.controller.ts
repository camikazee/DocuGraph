import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * Liveness/readiness probe. Zwraca status aplikacji i połączenia z bazą.
 */
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  check() {
    // mongoose readyState: 1 = connected
    const dbConnected = this.connection.readyState === 1;
    return {
      status: 'ok',
      db: dbConnected ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }
}
