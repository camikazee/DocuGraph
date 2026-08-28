import { Model } from 'mongoose';
import { JobsService } from './jobs.service';
import { JobDocument } from './schemas/job.schema';

describe('JobsService', () => {
  const exec = jest.fn();
  const model = {
    updateOne: jest.fn(() => ({ exec })),
    findOneAndUpdate: jest.fn(() => ({ exec })),
  };
  const service = new JobsService(model as unknown as Model<JobDocument>);

  beforeEach(() => jest.clearAllMocks());

  it('enqueues idempotently using set-on-insert', async () => {
    exec.mockResolvedValue({ upsertedCount: 1 });
    await service.enqueue('mail', { userId: 'u1' }, 'mail:event:u1');
    expect(model.updateOne).toHaveBeenCalledWith(
      { idempotencyKey: 'mail:event:u1' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ status: 'pending' }),
      }),
      { upsert: true },
    );
  });

  it('claims due or expired jobs with an atomic lease', async () => {
    exec.mockResolvedValue({ uuid: 'job' });
    await service.claimNext('worker');
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ $or: expect.any(Array) }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'running',
          workerId: 'worker',
        }),
        $inc: { attempts: 1 },
      }),
      expect.objectContaining({ new: true }),
    );
  });

  it('retries with a sanitized error before max attempts', async () => {
    exec.mockResolvedValue({ modifiedCount: 1 });
    await service.fail(
      {
        uuid: 'job',
        attempts: 2,
        maxAttempts: 5,
        runAt: new Date(0),
      } as JobDocument,
      new Error('SMTP\nfailed'),
    );
    expect(model.updateOne).toHaveBeenCalledWith(
      { uuid: 'job', status: 'running' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'pending',
          lastError: 'SMTP failed',
        }),
      }),
    );
  });

  it('marks the final failed attempt as terminal', async () => {
    exec.mockResolvedValue({ modifiedCount: 1 });
    await service.fail(
      {
        uuid: 'job',
        attempts: 5,
        maxAttempts: 5,
        runAt: new Date(0),
      } as JobDocument,
      new Error('rejected'),
    );
    expect(model.updateOne).toHaveBeenCalledWith(
      { uuid: 'job', status: 'running' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
});
