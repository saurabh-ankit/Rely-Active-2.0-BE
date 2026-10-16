/** What an entity inside a property is: towers, villas, shops… */
export enum PropertyEntityType {
  APARTMENT = 'apartment',
  VILLA = 'villa',
  DUPLEX = 'duplex',
  TRIPLEX = 'triplex',
}

/** The structural levels an entity can use. `unit` is always the leaf. */
export enum StructureLevel {
  BLOCK = 'block',
  FLOOR = 'floor',
  UNIT = 'unit',
}

/** Allowed level combinations, in nesting order. */
export const STRUCTURE_LEVEL_SETS: ReadonlyArray<ReadonlyArray<StructureLevel>> = [
  [StructureLevel.BLOCK, StructureLevel.FLOOR, StructureLevel.UNIT],
  [StructureLevel.BLOCK, StructureLevel.UNIT],
  [StructureLevel.FLOOR, StructureLevel.UNIT],
  [StructureLevel.UNIT],
]
