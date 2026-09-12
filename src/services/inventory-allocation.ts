// Monetary input is stored to two decimal places per package. Use integer cents
// and rational division so allocation rounding does not depend on floating point.
export function allocationAmount(quantity: number, packQuantity: number, price: number | string) {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(packQuantity) || packQuantity <= 0)
    throw new Error('Invalid receipt quantity or package size')
  const cents = BigInt(Math.round(Number(price) * 100))
  const divisor = BigInt(packQuantity)
  const rounded = (BigInt(quantity) * cents * 2n + divisor) / (2n * divisor)
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Inventory amount exceeds supported precision')
  return Number(rounded) / 100
}
export function sumAmounts(amounts: (number | string)[]) {
  const cents = amounts.reduce((sum, amount) => sum + BigInt(Math.round(Number(amount) * 100)), 0n)
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Inventory amount exceeds supported precision')
  return Number(cents) / 100
}
export function allocateFIFO<
  T extends { id: string; remainingQuantity: number; receivedDate: string; createdAt: Date },
>(receipts: T[], quantity: number): { receipt: T; quantity: number }[] {
  const sorted = [...receipts].sort(
    (a, b) =>
      a.receivedDate.localeCompare(b.receivedDate) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  )
  const allocations: { receipt: T; quantity: number }[] = []
  let remaining = quantity
  for (const receipt of sorted) {
    if (!remaining) break
    const take = Math.min(remaining, receipt.remainingQuantity)
    if (take <= 0) continue
    allocations.push({ receipt, quantity: take })
    remaining -= take
  }
  if (remaining) throw new Error('Insufficient reconciled receipt stock')
  return allocations
}
