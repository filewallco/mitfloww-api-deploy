import 'dotenv/config';
import { db } from '../src/lib/db/client';
import { fileVersions, FileProcessingStatus } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fileService } from '../src/lib/services/file-service';
import { connection as redis } from '../../worker/src/queue/connection';

async function assert(desc: string, condition: boolean, details?: any) {
  if (!condition) {
    console.error(`❌ FAIL: ${desc}`, details ? JSON.stringify(details, null, 2) : '');
    throw new Error(`Test assertion failed: ${desc}`);
  }
  console.log(`✅ PASS: ${desc}`);
}

async function main() {
  console.log('\n======================================================');
  console.log('   STALE-JOB RECOVERY & RESILIENCE TEST SUITE');
  console.log('======================================================\n');

  const now = Date.now();
  const testVersionId = 'a2531112-e146-45a8-af20-7d2cbc4f0bf9';

  // ---------------------------------------------------------
  // TEST 1: Worker Startup / Stale Redis Job Recovery
  // ---------------------------------------------------------
  console.log('\n--- Scenario 1: Worker Stale Heartbeat Recovery (Worker Crash Simulation) ---');
  const crashJobId = `test-crash-${now}`;
  await redis.hset(`job:${crashJobId}`, {
    fileId: crashJobId,
    fileVersionId: 'test-version-crash',
    status: 'processing',
    stage: 'processing',
    fileName: 'crash_test.png',
    size: '200000',
    fileType: 'image',
    heartbeatAt: String(now - 300_000), // 5 min ago (> 180s threshold)
    updatedAt: String(now - 300_000),
    queuedAt: String(now - 300_000),
    manualRetryCount: '1', // attempts = 1 < 3
    sourceBucket: 'mitfloww-files-dev',
    sourceKey: 'test/crash_test.png',
    outputBucket: 'mitfloww-files-dev',
    outputKey: 'test/crash_test_proc.png',
    callbackUrl: 'http://localhost:4001/api/file-processing/callback',
  });
  await redis.set(`lock:${crashJobId}`, 'dead-worker-pid-999', 'PX', 120_000);

  const { recoverStuckJobs } = await import('../../worker/src/server/admin.ts');
  const recoveredCount = await recoverStuckJobs();
  console.log('Worker recoverStuckJobs recovered count:', recoveredCount);

  const crashRedisAfter = await redis.hgetall(`job:${crashJobId}`);
  const crashLockAfter = await redis.get(`lock:${crashJobId}`);

  await assert('Worker detects stale heartbeat and retries job when attempts < 3',
    Number(crashRedisAfter.manualRetryCount) >= 2 || crashRedisAfter.status === 'retrying' || crashRedisAfter.status === 'queued',
    crashRedisAfter
  );
  await assert('Dead worker lock was cleared or reacquired by live worker', crashLockAfter !== 'dead-worker-pid-999', crashLockAfter);
  await redis.del(`job:${crashJobId}`);

  // ---------------------------------------------------------
  // TEST 2: Repeated Failure Exhaustion (No Infinite Retry Loop)
  // ---------------------------------------------------------
  console.log('\n--- Scenario 2: Repeated Failure Exhaustion in Worker (Max Retries Exceeded) ---');
  const exhaustedJobId = `test-exhausted-${now}`;
  await redis.hset(`job:${exhaustedJobId}`, {
    fileId: exhaustedJobId,
    fileVersionId: 'test-version-exhausted',
    status: 'processing',
    stage: 'processing',
    fileName: 'exhausted_test.png',
    size: '200000',
    fileType: 'image',
    heartbeatAt: String(now - 300_000), // 5 min ago
    updatedAt: String(now - 300_000),
    queuedAt: String(now - 300_000),
    manualRetryCount: '3', // 3 attempts made already!
    sourceBucket: 'mitfloww-files-dev',
    sourceKey: 'test/exhausted.png',
    outputBucket: 'mitfloww-files-dev',
    outputKey: 'test/exhausted_proc.png',
    callbackUrl: 'http://localhost:4001/api/file-processing/callback',
  });
  await redis.set(`lock:${exhaustedJobId}`, 'dead-worker-pid-888', 'PX', 120_000);

  await recoverStuckJobs();

  const exhaustedRedisAfter = await redis.hgetall(`job:${exhaustedJobId}`);
  const exhaustedLockAfter = await redis.get(`lock:${exhaustedJobId}`);

  await assert('Worker permanently marks job failed when retry limit (3) is reached',
    exhaustedRedisAfter.status === 'failed',
    exhaustedRedisAfter
  );
  await assert('Worker records stuck_recovery_exhausted error code',
    exhaustedRedisAfter.errorCode === 'stuck_recovery_exhausted',
    exhaustedRedisAfter
  );
  await assert('Dead worker lock is deleted on failure', exhaustedLockAfter === null, exhaustedLockAfter);
  await redis.del(`job:${exhaustedJobId}`);

  // ---------------------------------------------------------
  // TEST 3: Lock Safety & Race Condition Protection
  // ---------------------------------------------------------
  console.log('\n--- Scenario 3: Lock Safety & Fresh Heartbeat Protection ---');
  const activeJobId = `test-active-${now}`;
  await redis.hset(`job:${activeJobId}`, {
    fileId: activeJobId,
    status: 'processing',
    stage: 'processing',
    heartbeatAt: String(now - 10_000), // Fresh heartbeat (10s ago)
    updatedAt: String(now - 10_000),
    queuedAt: String(now - 20_000),
    manualRetryCount: '0',
  });
  await redis.set(`lock:${activeJobId}`, 'live-worker-pid-111', 'PX', 120_000);

  await recoverStuckJobs();

  const activeRedisAfter = await redis.hgetall(`job:${activeJobId}`);
  const activeLockAfter = await redis.get(`lock:${activeJobId}`);

  await assert('Active worker with fresh heartbeat is NOT disrupted by recovery',
    activeRedisAfter.status === 'processing' && activeLockAfter === 'live-worker-pid-111',
    { status: activeRedisAfter.status, lock: activeLockAfter }
  );
  await redis.del(`job:${activeJobId}`, `lock:${activeJobId}`);

  // ---------------------------------------------------------
  // TEST 4: Database Stale Job Reconciliation (Unresponsive Worker)
  // ---------------------------------------------------------
  console.log('\n--- Scenario 4: Database Stale Job Reconciliation (Postgres Level) ---');
  // Temporarily set a test version to processing state with an old updatedAt (4 mins ago) and attempts = 1
  await db.update(fileVersions).set({
    processingStatus: FileProcessingStatus.Processing,
    processingAttempts: 1,
    processingJobId: `orphan-job-${now}`,
    processingStartedAt: new Date(now - 240_000),
    queuedAt: new Date(now - 240_000),
    updatedAt: new Date(now - 240_000), // 4 mins ago (> 3 min threshold)
  }).where(eq(fileVersions.id, testVersionId));

  const staleResult = await fileService.reconcileStaleProcessingVersions();
  console.log('reconcileStaleProcessingVersions result:', staleResult);

  const [dbAfterReconcile] = await db.select().from(fileVersions).where(eq(fileVersions.id, testVersionId));

  await assert('Stale processing DB record is detected and reconciled',
    staleResult.reconciledCount >= 1,
    staleResult
  );
  await assert('Version attempts are incremented from 1 to 2',
    dbAfterReconcile.processingAttempts === 2,
    dbAfterReconcile.processingAttempts
  );
  await assert('Version status is transitioned to queued/retrying/processing',
    [FileProcessingStatus.Queued, FileProcessingStatus.Retrying, FileProcessingStatus.Processing].includes(dbAfterReconcile.processingStatus as any),
    dbAfterReconcile.processingStatus
  );

  // ---------------------------------------------------------
  // TEST 5: Database Exhaustion to Failed (Attempts >= 3)
  // ---------------------------------------------------------
  console.log('\n--- Scenario 5: Database Exhaustion to Failed (Attempts >= 3) ---');
  await db.update(fileVersions).set({
    processingStatus: FileProcessingStatus.Processing,
    processingAttempts: 3, // Already hit 3
    processingJobId: `exhausted-job-${now}`,
    processingStartedAt: new Date(now - 240_000),
    queuedAt: new Date(now - 240_000),
    updatedAt: new Date(now - 240_000),
  }).where(eq(fileVersions.id, testVersionId));

  const exhaustedDbResult = await fileService.reconcileStaleProcessingVersions();
  console.log('Exhausted reconciliation result:', exhaustedDbResult);

  const [dbAfterExhausted] = await db.select().from(fileVersions).where(eq(fileVersions.id, testVersionId));

  await assert('Attempts >= 3 transitions version directly to Failed in DB',
    dbAfterExhausted.processingStatus === FileProcessingStatus.Failed,
    dbAfterExhausted.processingStatus
  );
  await assert('Error code records stale_recovery_exhausted',
    dbAfterExhausted.processingErrorCode === 'stale_recovery_exhausted',
    dbAfterExhausted.processingErrorCode
  );

  // ---------------------------------------------------------
  // TEST 6: Restore Database Record to Completed
  // ---------------------------------------------------------
  console.log('\n--- Scenario 6: Cleanup & Restore DB Record to Completed ---');
  await db.update(fileVersions).set({
    processingStatus: FileProcessingStatus.Completed,
    processingAttempts: 1,
    processingErrorCode: null,
    processingErrorMessage: null,
    updatedAt: new Date(),
  }).where(eq(fileVersions.id, testVersionId));

  const [dbFinal] = await db.select().from(fileVersions).where(eq(fileVersions.id, testVersionId));
  await assert('Database record restored to completed', dbFinal.processingStatus === FileProcessingStatus.Completed);

  console.log('\n======================================================');
  console.log('   🎉 ALL 6 RESILIENCE SCENARIOS PASSED WITH SUCCESS!');
  console.log('======================================================\n');

  await redis.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
