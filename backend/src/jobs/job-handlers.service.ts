import { Injectable } from '@nestjs/common';

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

@Injectable()
export class JobHandlersService {
  private readonly handlers = new Map<string, JobHandler>();

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  get(kind: string): JobHandler | undefined {
    return this.handlers.get(kind);
  }
}
