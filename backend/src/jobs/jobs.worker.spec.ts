import { JobHandlersService } from './job-handlers.service';
import { JobsService } from './jobs.service';
import { JobsWorker } from './jobs.worker';
import { JobDocument } from './schemas/job.schema';

describe('JobsWorker', () => {
  const jobs = {
    claimNext: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
  };
  const handlers = new JobHandlersService();
  const worker = new JobsWorker(jobs as unknown as JobsService, handlers);

  beforeEach(() => jest.clearAllMocks());

  it('completes a successfully handled job', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    handlers.register('success', handler);
    jobs.claimNext.mockResolvedValue({
      uuid: 'job-1',
      kind: 'success',
      payload: { value: 1 },
    } as unknown as JobDocument);

    await worker.tick();
    expect(handler).toHaveBeenCalledWith({ value: 1 });
    expect(jobs.complete).toHaveBeenCalledWith('job-1');
    expect(jobs.fail).not.toHaveBeenCalled();
  });

  it('returns failed effects to the durable retry policy', async () => {
    const error = new Error('SMTP unavailable');
    handlers.register('failure', async () => Promise.reject(error));
    const job = {
      uuid: 'job-2',
      kind: 'failure',
      payload: {},
    } as unknown as JobDocument;
    jobs.claimNext.mockResolvedValue(job);

    await worker.tick();
    expect(jobs.fail).toHaveBeenCalledWith(job, error);
    expect(jobs.complete).not.toHaveBeenCalled();
  });
});
