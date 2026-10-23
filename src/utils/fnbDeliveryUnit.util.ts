import { FnbResidentOrder, PropertyBlock, PropertyFloor, PropertyUnit } from '../models/index.js'

/** The flat an order is delivered to, with its floor and block (as the order screens show it). */
export const deliveryUnitInclude = {
  model: PropertyUnit,
  as: 'deliveryUnit',
  attributes: ['id', 'unit_number'],
  required: false,
  include: [
    {
      model: PropertyFloor,
      as: 'floor',
      attributes: ['id', 'floor_number', 'floor_name', 'is_virtual'],
      include: [{ model: PropertyBlock, as: 'block', attributes: ['id', 'block_name'] }],
    },
  ],
}

type WithUnit = { setDataValue(key: string, value: unknown): void; unit?: unknown }

/**
 * The order screens read the flat from `resident.unit`. An order keeps the flat it was placed
 * for (the resident may have moved since), so show that flat there instead.
 */
export function showDeliveryUnit(order: FnbResidentOrder): FnbResidentOrder {
  const unit = order.deliveryUnit
  if (!unit) return order
  const residents = [
    order.resident as unknown as WithUnit | undefined,
    (order.familyMember as unknown as { resident?: WithUnit } | undefined)?.resident,
  ]
  for (const r of residents) {
    if (!r) continue
    r.setDataValue('unit', unit)
    r.unit = unit
  }
  return order
}
