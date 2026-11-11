import { Injectable } from '@nestjs/common';

export type MediaJobStatusCallback = {
  id?: string;
  tenantId?: string;
  fileId?: string;
  jobType?: string;
  status?: string;
  attempts?: number;
  outputs?: unknown[];
  lastError?: string;
  updatedAt?: string;
};

@Injectable()
export class MediaCallbackService {
  private readonly recentCallbacks: Array<
    MediaJobStatusCallback & { receivedAt: string }
  > = [];

  recordStatus(callback: MediaJobStatusCallback) {
    const receivedAt = new Date().toISOString();
    const recorded = { ...callback, receivedAt };
    this.recentCallbacks.push(recorded);

    if (this.recentCallbacks.length > 100) {
      this.recentCallbacks.shift();
    }

    return {
      accepted: true,
      callbackType: 'media_job_status',
      jobId: callback.id,
      tenantId: callback.tenantId,
      fileId: callback.fileId,
      status: callback.status,
      outputsCount: Array.isArray(callback.outputs)
        ? callback.outputs.length
        : 0,
      receivedAt,
    };
  }

  getRecentCallbacks() {
    return [...this.recentCallbacks];
  }
}
