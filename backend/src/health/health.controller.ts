import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * Liveness (`/health`) i readiness (`/ready`) probe.
 * - liveness: proces żyje (zawsze 200, dopóki serwer odpowiada),
 * - readiness: gotowy do ruchu — wymaga połączenia z bazą (503, gdy down).
 */
@Controller()
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('health')
  liveness() {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  readiness() {
    // mongoose readyState: 1 = connected
    const dbConnected = this.connection.readyState === 1;
    if (!dbConnected) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        db: 'down',
        timestamp: new Date().toISOString(),
      });
    }
    return {
      status: 'ready',
      db: 'up',
      timestamp: new Date().toISOString(),
    };
  }
}
