import { Op } from 'sequelize'
import sequelize from '../config/db/index.js'
import { logger } from '../config/logger.js'
import { flattenCatalog } from '../config/permissions/resourceCatalog.js'
import { Resource, UserLocationPermission } from '../models/index.js'

/**
 * Writes the resource catalogue to the `resources` table. Safe to run on every start:
 * - inserts new keys and updates names / descriptions / order of existing ones,
 * - deactivates keys no longer in the catalogue (their grants are kept),
 * - for a resource whose starting grants haven't been applied yet: with `grant: 'inherit'`,
 *   everyone who holds an action on the parent module gets the same action on it.
 *   This happens once (stamped in `grantsAppliedAt`), so access an admin removes later
 *   is never re-added.
 */
export async function syncResourceCatalog(): Promise<void> {
  const entries = flattenCatalog()
  const catalogKeys = entries.map((e) => e.key as string)

  await sequelize.transaction(async (transaction) => {
    const existing = await Resource.findAll({ transaction })
    const byKey = new Map(existing.map((r) => [r.key, r]))

    for (const entry of entries) {
      const row = byKey.get(entry.key)
      const values = {
        name: entry.name,
        description: entry.description,
        sortOrder: entry.sortOrder,
        isActive: true,
        isDeleted: false,
      }
      if (!row) {
        byKey.set(entry.key, await Resource.create({ key: entry.key, ...values }, { transaction }))
      } else if (
        row.name !== values.name ||
        row.description !== values.description ||
        row.sortOrder !== values.sortOrder ||
        !row.isActive ||
        row.isDeleted
      ) {
        await row.update(values, { transaction })
      }
    }

    // Removed from the catalogue → hidden from the matrix and denied, grants kept.
    await Resource.update(
      { isActive: false },
      { where: { key: { [Op.notIn]: catalogKeys }, isActive: true }, transaction },
    )

    // Starting grants for resources that haven't had them yet (parents first).
    let inherited = 0
    for (const entry of entries) {
      const row = byKey.get(entry.key)!
      if (row.grantsAppliedAt) continue
      if (entry.grant === 'inherit' && entry.parentKey) {
        const parentGrants = await UserLocationPermission.findAll({
          where: { resourceKey: entry.parentKey, isActive: true, isDeleted: false },
          attributes: ['userId', 'locationId', 'permission'],
          transaction,
        })
        const already = await UserLocationPermission.findAll({
          where: { resourceKey: entry.key, isDeleted: false },
          attributes: ['userId', 'locationId', 'permission'],
          transaction,
        })
        const have = new Set(already.map((g) => `${g.userId}|${g.locationId}|${g.permission}`))
        const toCreate = parentGrants
          .filter((g) => !have.has(`${g.userId}|${g.locationId}|${g.permission}`))
          .map((g) => ({
            userId: g.userId,
            locationId: g.locationId,
            resourceKey: entry.key,
            permission: g.permission,
            isActive: true,
            isDeleted: false,
          }))
        if (toCreate.length) await UserLocationPermission.bulkCreate(toCreate, { transaction })
        inherited += toCreate.length
      }
      await row.update({ grantsAppliedAt: new Date() }, { transaction })
    }
    if (inherited) logger.info({ inherited }, 'Resource catalogue: inherited sub-module grants')
  })
}
