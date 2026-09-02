import { FnbResidentOrder } from '../models/index.js'

async function debugStatus() {
  try {
    const orderId = '5c0f998e-2e8b-45bb-9be2-ec376f4fabd9'
    const order = await FnbResidentOrder.findByPk(orderId)
    console.log('Order found:', order?.toJSON())
    if (!order) return

    order.orderStatus = 'accepted'
    order.acceptedAt = new Date()
    await order.save()
    console.log('Save successful!')
  } catch (err) {
    console.error('Error saving order status:', err)
  }
}

debugStatus().then(() => process.exit(0))
