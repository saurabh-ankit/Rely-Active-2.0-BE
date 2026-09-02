import type { Request, Response } from 'express'
import {
  FnbResidentOrder,
  FnbResidentOrderDetail,
  FnbFoodDelivery,
  FnbDish,
  FnbGlobalMealSlot,
  FnbPropertySpecialSlot,
  Resident,
  ResidentFamilyMember,
  PropertyUnit,
  PropertyFloor,
  PropertyBlock,
  User,
  UserDetail,
} from '../../../models/index.js'

export async function getResidentOrdersForProperty(req: Request, res: Response): Promise<void> {
  try {
    const locId = String(req.query.locId || req.params.locId || '')
    if (!locId) {
      res.status(400).json({ success: false, message: 'locId is required' })
      return
    }

    const { date, orderStatus, orderType, search } = req.query

    const whereClause: Record<string, unknown> = { locId }

    if (date) {
      whereClause.date = String(date)
    }

    if (orderStatus) {
      whereClause.orderStatus = String(orderStatus)
    }

    if (orderType) {
      whereClause.orderType = String(orderType)
    }

    const orders = await FnbResidentOrder.findAll({
      where: whereClause,
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
          model: ResidentFamilyMember,
          as: 'familyMember',
          attributes: ['id', 'firstName', 'lastName', 'relation', 'phone'],
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
          ],
        },
        {
          model: FnbPropertySpecialSlot,
          as: 'specialMealSlot',
          attributes: ['id', 'name', 'price'],
        },
        {
          model: FnbResidentOrderDetail,
          as: 'details',
          include: [
            { model: FnbDish, as: 'dish', attributes: ['id', 'name', 'category', 'basePrice', 'imageUrl'] },
            { model: FnbGlobalMealSlot, as: 'globalMealSlot', attributes: ['id', 'name', 'code'] },
            { model: FnbPropertySpecialSlot, as: 'specialMealSlot', attributes: ['id', 'name'] },
          ],
        },
        {
          model: FnbFoodDelivery,
          as: 'delivery',
          include: [
            {
              model: User,
              as: 'employee',
              attributes: ['id', 'username', 'email', 'phone'],
            },
            {
              model: UserDetail,
              as: 'employeeDetail',
              attributes: ['id', 'userId', 'firstName', 'lastName', 'phone', 'employeeCode', 'photoUrl'],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    // Filter by search query if provided (searching resident name, unit number, block, floor, or order ID)
    let filteredOrders = orders
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase()
      filteredOrders = orders.filter((o) => {
        const plain = o.get({ plain: true }) as unknown as {
          id?: string
          resident?: {
            firstName?: string
            lastName?: string
            unit?: {
              unit_number?: string
              floor?: {
                floor_name?: string
                floor_number?: number | string
                block?: {
                  block_name?: string
                }
              }
            }
          }
          familyMember?: {
            firstName?: string
            lastName?: string
            resident?: {
              unit?: {
                unit_number?: string
                floor?: {
                  floor_name?: string
                  floor_number?: number | string
                  block?: {
                    block_name?: string
                  }
                }
              }
            }
          }
        }
        const resName = `${plain.resident?.firstName || ''} ${plain.resident?.lastName || ''}`.toLowerCase()
        const famName = `${plain.familyMember?.firstName || ''} ${plain.familyMember?.lastName || ''}`.toLowerCase()
        const unitObj = plain.resident?.unit || plain.familyMember?.resident?.unit
        const unitNum = (unitObj?.unit_number || '').toLowerCase()
        const floorName = (
          unitObj?.floor?.floor_name ||
          (unitObj?.floor?.floor_number !== undefined ? `floor ${unitObj.floor.floor_number}` : '')
        ).toLowerCase()
        const blockName = (unitObj?.floor?.block?.block_name || '').toLowerCase()
        const orderId = (plain.id || '').toLowerCase()
        return (
          resName.includes(q) ||
          famName.includes(q) ||
          unitNum.includes(q) ||
          floorName.includes(q) ||
          blockName.includes(q) ||
          orderId.includes(q)
        )
      })
    }

    res.status(200).json({ success: true, data: filteredOrders })
  } catch (error) {
    console.error('Error fetching resident orders:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch resident orders' })
  }
}

export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  try {
    const orderId = String(req.params.id)
    const { orderStatus } = req.body

    const order = await FnbResidentOrder.findByPk(orderId)
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' })
      return
    }

    const nextStatus = String(orderStatus).toLowerCase()
    order.orderStatus = nextStatus

    const now = new Date()
    if (nextStatus === 'accepted' && !order.acceptedAt) {
      order.acceptedAt = now
    } else if (nextStatus === 'preparing' && !order.preparingStartedAt) {
      order.preparingStartedAt = now
    } else if (nextStatus === 'ready' && !order.readyAt) {
      order.readyAt = now
    } else if ((nextStatus === 'completed' || nextStatus === 'delivered') && !order.deliveredAt) {
      order.deliveredAt = now
    }

    order.updatedBy = (req as Request & { user?: { id?: string } }).user?.id || null
    await order.save()

    res.status(200).json({ success: true, data: order })
  } catch (error) {
    console.error('Error updating order status:', error)
    res.status(500).json({ success: false, message: 'Failed to update order status' })
  }
}

export async function assignDeliveryEmployee(req: Request, res: Response): Promise<void> {
  try {
    const orderId = String(req.params.id)
    const { employeeId, deliveryCharge = 0 } = req.body
    const userId = (req as Request & { user?: { id?: string } }).user?.id || null

    const order = await FnbResidentOrder.findByPk(orderId)
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' })
      return
    }

    const chargeNum = Math.max(0, Number(deliveryCharge || 0))

    // Update order status & delivery charge
    order.orderStatus = 'delivering_to_room'
    order.deliveryCharge = chargeNum
    order.assignedEmployeeId = employeeId || null
    order.updatedBy = userId

    // Adjust totalAmount if delivery charge was added
    if (chargeNum > 0) {
      order.totalAmount = Number(order.totalAmount || 0) + chargeNum
    }
    await order.save()

    // Upsert FnbFoodDelivery record
    let delivery = await FnbFoodDelivery.findOne({ where: { orderId: order.id } })
    if (delivery) {
      delivery.employeeId = employeeId || null
      delivery.deliveryCharge = chargeNum
      delivery.deliveryStatus = 'delivering'
      delivery.updatedBy = userId
      await delivery.save()
    } else {
      delivery = await FnbFoodDelivery.create({
        locId: order.locId,
        orderId: order.id,
        employeeId: employeeId || null,
        deliveryCharge: chargeNum,
        deliveryStatus: 'delivering',
        deliveryDate: String(order.date),
        createdBy: userId,
      })
    }

    res.status(200).json({
      success: true,
      message: 'Delivery employee assigned successfully',
      data: { order, delivery },
    })
  } catch (error) {
    console.error('Error assigning delivery employee:', error)
    res.status(500).json({ success: false, message: 'Failed to assign delivery employee' })
  }
}

export async function completeRoomDelivery(req: Request, res: Response): Promise<void> {
  try {
    const orderId = String(req.params.id)
    const { photoUrl } = req.body
    const userId = (req as Request & { user?: { id?: string } }).user?.id || null

    const order = await FnbResidentOrder.findByPk(orderId)
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' })
      return
    }

    const now = new Date()
    order.orderStatus = 'completed'
    order.deliveredAt = now
    order.updatedBy = userId
    await order.save()

    let delivery = await FnbFoodDelivery.findOne({ where: { orderId: order.id } })
    if (delivery) {
      delivery.deliveryStatus = 'delivered'
      if (photoUrl) delivery.photoUrl = photoUrl
      delivery.deliveredAt = now
      delivery.updatedBy = userId
      await delivery.save()
    } else {
      delivery = await FnbFoodDelivery.create({
        locId: order.locId,
        orderId: order.id,
        employeeId: order.assignedEmployeeId || null,
        deliveryCharge: order.deliveryCharge || 0,
        deliveryStatus: 'delivered',
        photoUrl: photoUrl || null,
        deliveryDate: String(order.date),
        deliveredAt: now,
        createdBy: userId,
      })
    }

    res.status(200).json({
      success: true,
      message: 'Room delivery completed successfully',
      data: { order, delivery },
    })
  } catch (error) {
    console.error('Error completing room delivery:', error)
    res.status(500).json({ success: false, message: 'Failed to complete room delivery' })
  }
}

export async function getFnbStaffEmployees(req: Request, res: Response): Promise<void> {
  try {
    const users = await User.findAll({
      where: {
        status: 'ACTIVE',
      },
      attributes: ['id', 'username', 'email', 'phone'],
      include: [
        {
          model: UserDetail,
          as: 'detail',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'employeeCode', 'photoUrl'],
        },
      ],
    })

    res.status(200).json({
      success: true,
      data: users,
    })
  } catch (error) {
    console.error('Error fetching F&B staff employees:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch staff employees' })
  }
}
