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

  it('zwraca status ok i db up gdy połączenie aktywne', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.db).toBe('up');
    expect(result.timestamp).toBeDefined();
  });
});
