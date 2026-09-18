import { Queue, Worker, type Job } from 'bullmq'
import { Redis } from 'ioredis'
import { BillingAccount, BillingRun } from '../models/index.js'
import { BillingRunStatus, BillingRunType } from '../enums/billing.enum.js'
import { generateInvoiceForAccount } from '../services/billing/invoiceGenerator.service.js'
import { logger } from '../config/logger.js'

export const BILLING_QUEUE_NAME = 'billing-batch-runs'

export interface BillingBatchJobData {
  billingRunId?: string | undefined
  propertyId: string
  companyId?: string | undefined
  periodStart: string
  periodEnd: string
  runType: BillingRunType
  runBy?: string | undefined
}

export interface BillingBatchJobResult {
  billingRunId: string
  totalAccounts: number
  successfulInvoices: number
  failedInvoices: number
  totalAmount: number
  status: BillingRunStatus
}

// ── Redis Connection Configuration ──────────────────────────────────────────

const redisHost = process.env.REDIS_HOST || '127.0.0.1'
const redisPort = Number(process.env.REDIS_PORT) || 6379
const redisPassword = process.env.REDIS_PASSWORD || undefined

export function createRedisConnection(): Redis {
  return new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })
}

// ── Direct Execution Engine (Supports synchronous execution and worker) ─────

export async function processBatchBilling(data: BillingBatchJobData): Promise<BillingBatchJobResult> {
  const { propertyId, periodStart, periodEnd, runType, runBy } = data

  // 1. Initialize or find billing run record
  let run: BillingRun
  if (data.billingRunId) {
    const existing = await BillingRun.findByPk(data.billingRunId)
    if (!existing) throw new Error(`Billing run ${data.billingRunId} not found`)
    run = existing
    await run.update({ status: BillingRunStatus.RUNNING, startedAt: new Date() })
  } else {
    run = await BillingRun.create({
      propertyId,
      companyId: data.companyId || '00000000-0000-0000-0000-000000000000',
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      runType,
      status: BillingRunStatus.RUNNING,
      startedAt: new Date(),
      runBy: runBy || null,
      totalAccounts: 0,
      successfulInvoices: 0,
      failedInvoices: 0,
      totalAmount: 0,
    })
  }

  try {
    // 2. Load all active accounts for property
    const accounts = await BillingAccount.findAll({
      where: {
        propertyId,
        status: 'ACTIVE',
        isActive: true,
        isDeleted: false,
      },
    })

    const totalAccounts = accounts.length
    let successfulInvoices = 0
    let failedInvoices = 0
    let totalAmount = 0
    const isPreview = runType === BillingRunType.PREVIEW

    // 3. Process each account sequentially to avoid ledger race conditions
    for (const account of accounts) {
      try {
        const result = await generateInvoiceForAccount({
          billingAccountId: account.id,
          periodStart,
          periodEnd,
          isPreview,
          performedBy: runBy,
        })

        successfulInvoices += 1
        const invoiceTotal = result.invoice?.grandTotal ?? result.preview?.grandTotal ?? 0
        totalAmount += Number(invoiceTotal)
      } catch (accountError) {
        failedInvoices += 1
        logger.error(
          { error: accountError, accountId: account.id, propertyId },
          'Failed to generate invoice for account in billing run',
        )
      }
    }

    totalAmount = Number(totalAmount.toFixed(2))

    // 4. Mark run as completed
    await run.update({
      status: BillingRunStatus.COMPLETED,
      completedAt: new Date(),
      totalAccounts,
      successfulInvoices,
      failedInvoices,
      totalAmount,
    })

    return {
      billingRunId: run.id,
      totalAccounts,
      successfulInvoices,
      failedInvoices,
      totalAmount,
      status: BillingRunStatus.COMPLETED,
    }
  } catch (error) {
    logger.error({ error, billingRunId: run.id }, 'Billing batch run failed critically')
    await run.update({
      status: BillingRunStatus.FAILED,
      completedAt: new Date(),
    })
    throw error
  }
}

// ── BullMQ Queue & Worker Instantiation (Lazy) ───────────────────────────────

let billingQueue: Queue<BillingBatchJobData, BillingBatchJobResult> | null = null
let billingWorker: Worker<BillingBatchJobData, BillingBatchJobResult> | null = null

export function getBillingQueue(): Queue<BillingBatchJobData, BillingBatchJobResult> {
  if (!billingQueue) {
    const connection = createRedisConnection()
    billingQueue = new Queue(BILLING_QUEUE_NAME, { connection })
  }
  return billingQueue
}

export function initBillingWorker(): Worker<BillingBatchJobData, BillingBatchJobResult> {
  if (!billingWorker) {
    const connection = createRedisConnection()
    billingWorker = new Worker(
      BILLING_QUEUE_NAME,
      async (job: Job<BillingBatchJobData, BillingBatchJobResult>) => {
        logger.info({ jobId: job.id, data: job.data }, 'Processing batch billing job')
        return processBatchBilling(job.data)
      },
      { connection, concurrency: 1 },
    )

    billingWorker.on('completed', (job) => {
      logger.info({ jobId: job.id, result: job.returnvalue }, 'Batch billing job completed')
    })

    billingWorker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, error: err }, 'Batch billing job failed')
    })
  }
  return billingWorker
}
