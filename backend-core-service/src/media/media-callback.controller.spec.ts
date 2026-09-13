import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';

import { MediaCallbackController } from './media-callback.controller';
import { MediaCallbackService } from './media-callback.service';

describe('MediaCallbackController', () => {
  let controller: MediaCallbackController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaCallbackController],
      providers: [MediaCallbackService],
    }).compile();

    controller = module.get<MediaCallbackController>(MediaCallbackController);
  });

  it('accepts internal media job status callbacks', () => {
    expect(
      controller.recordStatus({
        id: 'media-job-1',
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'scan',
        status: 'completed',
        outputs: [{ type: 'file-scan' }],
      }),
    ).toMatchObject({
      accepted: true,
      callbackType: 'media_job_status',
      jobId: 'media-job-1',
      tenantId: 'tenant-1',
      fileId: 'file-1',
      status: 'completed',
      outputsCount: 1,
    });
  });

  it('requires service authentication at the route boundary', () => {
    const recordStatus = Object.getOwnPropertyDescriptor(
      MediaCallbackController.prototype,
      'recordStatus',
    )?.value as object;
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      recordStatus,
    ) as unknown[];
    expect(guards).toHaveLength(1);
  });
});
