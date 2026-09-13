import cron from 'node-cron'
import { Op } from 'sequelize'
import { Package } from '../../models/package.model.js'
import { PackageSubscription, SubscriptionStatus } from '../../models/packageSubscription.model.js'
import { PackageSubscriptionFeature } from '../../models/packageSubscriptionFeature.model.js'

/**
 * Monthly package reset cron job
 * Runs daily at 00:00 (midnight)
 * Checks if a month has passed since subscription startDate and resets complimentary features
 * Only processes ACTIVE packages and features with isDeleted = 0
 */
export const startMonthlyPackageResetCron = () => {
  // Run daily at 00:00 (midnight)
  // Cron expression: "0 0 * * *" means: minute=0, hour=0, every day, every month, every dayOfWeek
  cron.schedule('0 0 * * *', async () => {
    console.log('🔄 [MONTHLY RESET CRON] Starting daily package reset check...')

    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Find all active package subscriptions where:
      // - status = 'ACTIVE'
      // - endDate IS NULL (active packages without end date)
      // - Associated care package has duration = 'Monthly'
      const activeMonthlySubscriptions = await PackageSubscription.findAll({
        where: {
          status: SubscriptionStatus.ACTIVE,
          isDeleted: false,
          endDate: null, // Only active packages without end date
        },
        include: [
          {
            model: Package,
            as: 'carePackage',
            where: {
              duration: {
                [Op.in]: ['Monthly', 'monthly'],
              },
              isDeleted: false,
            },
            attributes: ['id', 'packageName', 'duration'],
          },
        ],
      })

      console.log(
        `🔍 [MONTHLY RESET CRON] Found ${activeMonthlySubscriptions.length} active monthly subscriptions to check`,
      )

      let resetCount = 0
      let skippedCount = 0
      let errorCount = 0

      for (const subscription of activeMonthlySubscriptions) {
        try {
          // Get subscription startDate (original admission date)
          const originalStartDate = new Date(subscription.startDate)
          originalStartDate.setHours(0, 0, 0, 0)

          // Calculate the number of full months that have passed since the original startDate
          const monthsDiff =
            (today.getFullYear() - originalStartDate.getFullYear()) * 12 +
            (today.getMonth() - originalStartDate.getMonth())

          // Calculate the next monthly anniversary date (same day of month as startDate)
          // For example: if startDate is 2025-11-18, next reset will be on 2025-12-18
          const nextResetDate = new Date(originalStartDate)
          nextResetDate.setMonth(originalStartDate.getMonth() + monthsDiff + 1)
          nextResetDate.setDate(originalStartDate.getDate())

          // Only reset if today is on or past the next monthly anniversary
          // This ensures we reset exactly once per month cycle
          if (today >= nextResetDate) {
            // Get all package subscription features for this subscription (only isDeleted = 0)
            const subscriptionFeatures = await PackageSubscriptionFeature.findAll({
              where: {
                packageSubscriptionId: subscription.id,
                isDeleted: false, // Only get non-deleted features
              },
            })

            console.log(
              `🔍 [MONTHLY RESET CRON] Found ${
                subscriptionFeatures.length
              } features for subscription ${subscription.id} (startDate: ${
                originalStartDate.toISOString().split('T')[0]
              }, month anniversary: ${nextResetDate.toISOString().split('T')[0]})`,
            )

            // Reset remainingCount to complimentaryCount for each feature
            for (const feature of subscriptionFeatures) {
              // Use getDataValue to access Sequelize model fields properly
              const oldRemainingCount = feature.getDataValue('remainingCount')
              const complimentaryCount = feature.getDataValue('complimentaryCount')
              const isDeleted = feature.getDataValue('isDeleted')

              // Only update if not deleted (isDeleted = 0)
              if (isDeleted) {
                console.log(`  ↳ Feature ${feature.id}: Skipped (isDeleted = true)`)
                continue
              }

              console.log(
                `  ↳ Feature ${feature.id}: Before update - remainingCount: ${oldRemainingCount}, complimentaryCount: ${complimentaryCount}`,
              )

              // Update the feature - only update non-deleted records (isDeleted = 0)
              await PackageSubscriptionFeature.update(
                {
                  remainingCount: complimentaryCount,
                },
                {
                  where: {
                    id: feature.id,
                    isDeleted: false, // Only update non-deleted records
                  },
                },
              )

              // Reload to verify the update
              await feature.reload()
              const updatedRemainingCount = feature.getDataValue('remainingCount')
              const updatedComplimentaryCount = feature.getDataValue('complimentaryCount')

              console.log(
                `  ↳ Feature ${feature.id}: After update - remainingCount: ${updatedRemainingCount}, complimentaryCount: ${updatedComplimentaryCount}`,
              )
            }

            // IMPORTANT: startDate is NOT updated as per user's request.
            // The monthly cycle will always be calculated from the original admission startDate.
            // Next reset will be calculated from the same startDate, so it will reset again after another month.

            resetCount++
            // Safely get package name
            const subscriptionData = subscription.toJSON ? subscription.toJSON() : subscription
            const carePackage = subscription.carePackage as Package | undefined
            const packageName =
              carePackage?.packageName ||
              (subscriptionData as { carePackage?: { packageName?: string } }).carePackage?.packageName ||
              'Unknown Package'
            console.log(
              `✅ [MONTHLY RESET CRON] Reset subscription ${subscription.id} (${packageName}) - Reset ${
                subscriptionFeatures.length
              } features - Month anniversary: ${nextResetDate.toISOString().split('T')[0]}`,
            )
          } else {
            skippedCount++
            const daysRemaining = Math.ceil((nextResetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            console.log(
              `⏭️  [MONTHLY RESET CRON] Skipped subscription ${
                subscription.id
              } - ${daysRemaining} days remaining until next reset (month anniversary: ${
                nextResetDate.toISOString().split('T')[0]
              })`,
            )
          }
        } catch (error: unknown) {
          errorCount++
          const err = error as Error
          console.error(
            `❌ [MONTHLY RESET CRON] Error processing subscription ${subscription.id}:`,
            err.message,
            err.stack,
          )
        }
      }

      console.log(
        `✅ [MONTHLY RESET CRON] Daily check completed. Reset: ${resetCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`,
      )
    } catch (error: unknown) {
      const err = error as Error
      console.error('❌ [MONTHLY RESET CRON] Fatal error in package reset cron:', err.message)
    }
  })

  console.log('✅ [MONTHLY RESET CRON] Daily package reset cron job scheduled (runs daily at 00:00)')
}

export default startMonthlyPackageResetCron
