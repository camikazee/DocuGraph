import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobHandlersService } from './job-handlers.service';
import { JobsService } from './jobs.service';
import { JobsWorker } from './jobs.worker';
import { Job, JobSchema } from './schemas/job.schema';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }])],
  providers: [JobsService, JobHandlersService, JobsWorker],
  exports: [JobsService, JobHandlersService],
})
export class JobsModule {}
