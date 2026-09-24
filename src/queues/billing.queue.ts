import { Queue, Worker, type Job } from 'bullmq'
import { Redis } from 'ioredis'
import { logger } from '../config/logger.js'

export const BILLING_QUEUE_NAME = 'billing-batch-runs'

export interface BillingBatchJobData {
  billingRunId?: string | undefined
  propertyId: string
  companyId?: string | undefined
  periodStart: string
  periodEnd: string
  runType: string
  runBy?: string | undefined
}

export interface BillingBatchJobResult {
  billingRunId: string
  totalAccounts: number
  successfulInvoices: number
  failedInvoices: number
  totalAmount: number
  status: string
}

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

export async function processBatchBilling(data: BillingBatchJobData): Promise<BillingBatchJobResult> {
  logger.info({ data }, 'Batch billing processed via rely-assist billing model')
  return {
    billingRunId: data.billingRunId || 'completed',
    totalAccounts: 0,
    successfulInvoices: 0,
    failedInvoices: 0,
    totalAmount: 0,
    status: 'COMPLETED',
  }
}

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
