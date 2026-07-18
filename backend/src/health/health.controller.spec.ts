import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          // Zaślepka połączenia mongoose — readyState 1 = connected
          provide: getConnectionToken(),
          useValue: { readyState: 1 },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('liveness zwraca status ok i uptime', () => {
    const result = controller.liveness();
    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
    expect(result.timestamp).toBeDefined();
  });

  it('readiness zwraca ready i db up gdy połączenie aktywne', () => {
    const result = controller.readiness();
    expect(result.status).toBe('ready');
    expect(result.db).toBe('up');
  });
});
