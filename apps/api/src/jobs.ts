/**
 * Background jobs (D-58, TR-070) on pg-boss, in the `pgboss` schema, connected as the application role. Job rows
 * hold job state only. Every job carries its institution id and the worker sets the row-level-security scope before
 * it touches data, exactly as a request does.
 */
import { PgBoss } from 'pg-boss';
import { eq } from 'drizzle-orm';
import { withInstitution, type Db } from './db/client';
import { connectors } from './db/schema';
import { syncConnector } from './connectors/sync';

export const QUEUES = {
  connectorSync: 'connector-sync',
  ciCrawl: 'ci-crawl',
  interventionSweep: 'intervention-sweep',
} as const;

export interface ConnectorJob {
  institutionId: string;
  connectorId: string;
}

export interface JobScheduler {
  readonly enabled: boolean;
  /** Schedules (or reschedules) a connector's sync; one schedule per connector. */
  scheduleConnector(job: ConnectorJob, cron: string): Promise<void>;
  unscheduleConnector(connectorId: string): Promise<void>;
  send(queue: string, data: object): Promise<string | null>;
  /** Schedules a recurring job; one schedule per queue and key (idempotent). */
  scheduleRecurring(queue: string, cron: string, data: object, key: string): Promise<void>;
  /** Registers a worker for a queue (used by later modules such as competitive intelligence). */
  work(queue: string, handler: (data: Record<string, unknown>) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}

/** Used when jobs are off (tests, or JOBS_ENABLED=false): scheduling is refused with a clear message. */
export const disabledJobs: JobScheduler = {
  enabled: false,
  async scheduleConnector() {
    throw new Error('Background jobs are disabled on this server (JOBS_ENABLED=false).');
  },
  async unscheduleConnector() {},
  async scheduleRecurring() {},
  async send() {
    throw new Error('Background jobs are disabled on this server (JOBS_ENABLED=false).');
  },
  async work() {},
  async stop() {},
};

export async function startJobs(db: Db, connectionString: string): Promise<JobScheduler> {
  // Tables come from migration 0008 (run by the owner); the app role never migrates the job schema itself.
  const boss = new PgBoss({ connectionString, schema: 'pgboss', migrate: false });
  boss.on('error', (err) => console.error('[jobs]', err.message));
  await boss.start();
  for (const q of Object.values(QUEUES)) await boss.createQueue(q).catch(() => undefined);

  await boss.work<ConnectorJob>(QUEUES.connectorSync, async (jobs) => {
    for (const job of jobs) {
      const { institutionId, connectorId } = job.data;
      await withInstitution(db, institutionId, async (tx) => {
        const [c] = await tx.select().from(connectors).where(eq(connectors.id, connectorId));
        // A paused or retired connector never syncs, even if a stale schedule fires.
        if (!c || c.status === 'paused' || c.status === 'retired') return;
        await syncConnector(tx, institutionId, c, null, 'schedule');
      });
    }
  });

  return {
    enabled: true,
    async scheduleConnector(job, cron) {
      await boss.schedule(QUEUES.connectorSync, cron, job, { key: job.connectorId });
    },
    async unscheduleConnector(connectorId) {
      await boss.unschedule(QUEUES.connectorSync, connectorId);
    },
    send: (queue, data) => boss.send(queue, data),
    async scheduleRecurring(queue, cron, data, key) {
      await boss.schedule(queue, cron, data, { key });
    },
    async work(queue, handler) {
      await boss.work<Record<string, unknown>>(queue, async (jobs) => {
        for (const j of jobs) await handler(j.data);
      });
    },
    stop: () => boss.stop(),
  };
}
