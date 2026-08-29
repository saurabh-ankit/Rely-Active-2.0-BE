export enum OccupancyStatus {
  VACANT = 'VACANT',
  OWNER_OCCUPIED = 'OWNER_OCCUPIED',
  TENANT_OCCUPIED = 'TENANT_OCCUPIED',
}

export enum UnitType {
  BHK1 = '1BHK',
  BHK2 = '2BHK',
  BHK3 = '3BHK',
  BHK4 = '4BHK',
  STUDIO = 'studio',
  PENTHOUSE = 'penthouse',
  SHOP = 'shop',
  OFFICE = 'office',
}

export enum UnitFacing {
  NORTH = 'north',
  SOUTH = 'south',
  EAST = 'east',
  WEST = 'west',
  NORTHEAST = 'northeast',
  NORTHWEST = 'northwest',
  SOUTHEAST = 'southeast',
  SOUTHWEST = 'southwest',
}

export enum UnitStatus {
  AVAILABLE = 'available',
  BOOKED = 'booked',
  SOLD = 'sold',
  ON_HOLD = 'on_hold',
}

export enum UnitAreaUnit {
  SQFT = 'sqft',
  SQMT = 'sqmt',
  ACRES = 'acres',
}
