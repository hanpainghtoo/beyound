import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs';
import { dirname, resolve } from 'path';

export type MediaJobType = 'thumbnail' | 'optimize' | 'scan' | 'transcribe';
export type MediaJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type MediaJobInput = {
  tenantId: string;
  fileId: string;
  jobType: MediaJobType;
  options?: Record<string, unknown>;
};

export type MediaJobOutput = {
  type: string;
  sourceFileId: string;
  fileId?: string;
  provider?: string;
  status: 'generated' | 'placeholder';
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MediaJobRecord = MediaJobInput & {
  id: string;
  status: MediaJobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  nextAttemptAt?: string;
  lastError?: string;
  outputs: MediaJobOutput[];
  callbackAttempts: number;
  callbackStatus: 'pending' | 'sent' | 'skipped' | 'failed';
  callbackLastError?: string;
  callbackUpdatedAt?: string;
};

export class MediaJobStore {
  private readonly path: string;

  constructor(
    path = process.env.MEDIA_JOB_STORE_PATH || '.data/media-jobs.json',
  ) {
    this.path = resolve(path);
  }

  save(job: MediaJobRecord) {
    const jobs = this.readAllMap();
    jobs[job.id] = job;
    this.writeAllMap(jobs);
    return job;
  }

  get(id: string) {
    return this.readAllMap()[id];
  }

  list() {
    return Object.values(this.readAllMap()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  countsByStatus() {
    return this.list().reduce(
      (counts, job) => ({
        ...counts,
        [job.status]: counts[job.status] + 1,
      }),
      { queued: 0, processing: 0, completed: 0, failed: 0 } satisfies Record<
        MediaJobStatus,
        number
      >,
    );
  }

  nextQueuedJob(now = new Date()) {
    return this.list().find((job) => {
      if (job.status !== 'queued') return false;
      if (!job.nextAttemptAt) return true;
      return new Date(job.nextAttemptAt).getTime() <= now.getTime();
    });
  }

  private readAllMap(): Record<string, MediaJobRecord> {
    if (!existsSync(this.path)) return {};

    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as Record<
        string,
        MediaJobRecord
      >;
    } catch {
      return {};
    }
  }

  private writeAllMap(jobs: Record<string, MediaJobRecord>) {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(jobs, null, 2), 'utf8');
    renameSync(temporaryPath, this.path);
  }
}
