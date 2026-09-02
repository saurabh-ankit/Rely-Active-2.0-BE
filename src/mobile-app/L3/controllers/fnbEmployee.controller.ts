import type { Request, Response } from 'express'
import {
  FnbFoodDelivery,
  FnbResidentOrder,
  FnbResidentOrderDetail,
  FnbDish,
  FnbGlobalMealSlot,
  Resident,
  PropertyUnit,
  PropertyFloor,
  PropertyBlock,
} from '../../../models/index.js'

/**
 * Get all assigned deliveries for food department employee
 */
export async function getAssignedDeliveries(req: Request, res: Response): Promise<void> {
  try {
    const locId = String(req.query.locId || req.params.locId || '')
    const employeeId = (req as Request & { user?: { id?: string } }).user?.id

    const whereClause: Record<string, unknown> = {}
    if (locId) {
      whereClause.locId = locId
    }
    if (employeeId) {
      whereClause.employeeId = employeeId
    }

    const deliveries = await FnbFoodDelivery.findAll({
      where: whereClause,
      include: [
        {
          model: FnbResidentOrder,
          as: 'order',
          include: [
            {
              model: Resident,
              as: 'resident',
              attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
              include: [
                {
                  model: PropertyUnit,
                  as: 'unit',
                  attributes: ['id', 'unit_number'],
                  include: [
                    {
                      model: PropertyFloor,
                      as: 'floor',
                      attributes: ['id', 'floor_number', 'floor_name'],
                      include: [
                        {
                          model: PropertyBlock,
                          as: 'block',
                          attributes: ['id', 'block_name'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              model: FnbResidentOrderDetail,
              as: 'details',
              include: [
                { model: FnbDish, as: 'dish', attributes: ['id', 'name', 'category', 'imageUrl'] },
                { model: FnbGlobalMealSlot, as: 'globalMealSlot', attributes: ['id', 'name'] },
              ],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    res.status(200).json({
      success: true,
      data: deliveries,
    })
  } catch (error) {
    console.error('Error fetching employee assigned deliveries:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch assigned deliveries' })
  }
}

/**
 * Update delivery status (e.g. assigned -> delivering -> delivered)
 */
export async function updateDeliveryStatus(req: Request, res: Response): Promise<void> {
  try {
    const deliveryId = String(req.params.id)
    const { deliveryStatus, photoUrl } = req.body
    const userId = (req as Request & { user?: { id?: string } }).user?.id || null

    const delivery = await FnbFoodDelivery.findByPk(deliveryId)
    if (!delivery) {
      res.status(404).json({ success: false, message: 'Delivery record not found' })
      return
    }

    if (deliveryStatus) {
      delivery.deliveryStatus = deliveryStatus
    }
    if (photoUrl) {
      delivery.photoUrl = photoUrl
    }

    const now = new Date()
    if (deliveryStatus === 'delivered') {
      delivery.deliveredAt = now
    }

    delivery.updatedBy = userId
    await delivery.save()

    // Sync order status
    const order = await FnbResidentOrder.findByPk(delivery.orderId)
    if (order) {
      if (deliveryStatus === 'delivering') {
        order.orderStatus = 'delivering_to_room'
      } else if (deliveryStatus === 'delivered') {
        order.orderStatus = 'completed'
        order.deliveredAt = now
      }
      order.updatedBy = userId
      await order.save()
    }

    res.status(200).json({
      success: true,
      message: 'Delivery status updated successfully',
      data: { delivery, order },
    })
  } catch (error) {
    console.error('Error updating delivery status:', error)
    res.status(500).json({ success: false, message: 'Failed to update delivery status' })
  }
}

/**
 * Complete room delivery with proof photo URL
 */
export async function completeDeliveryWithProof(req: Request, res: Response): Promise<void> {
  try {
    const deliveryId = String(req.params.id)
    const { photoUrl } = req.body
    const userId = (req as Request & { user?: { id?: string } }).user?.id || null

    const delivery = await FnbFoodDelivery.findByPk(deliveryId)
    if (!delivery) {
      res.status(404).json({ success: false, message: 'Delivery record not found' })
      return
    }

    const now = new Date()
    delivery.deliveryStatus = 'delivered'
    if (photoUrl) {
      delivery.photoUrl = photoUrl
    }
    delivery.deliveredAt = now
    delivery.updatedBy = userId
    await delivery.save()

    const order = await FnbResidentOrder.findByPk(delivery.orderId)
    if (order) {
      order.orderStatus = 'completed'
      order.deliveredAt = now
      order.updatedBy = userId
      await order.save()
    }

    res.status(200).json({
      success: true,
      message: 'Room delivery completed with proof photo',
      data: { delivery, order },
    })
  } catch (error) {
    console.error('Error completing room delivery with proof:', error)
    res.status(500).json({ success: false, message: 'Failed to complete delivery proof' })
  }
}
