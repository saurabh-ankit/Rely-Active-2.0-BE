// Some installations had the earlier 19:00 migration recorded against the
// simplified schema. Reconcile them without resetting any existing records.
export { up, down } from './20260912190000-create-center-inventory-stock.js'
