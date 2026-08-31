import type { Request, Response } from 'express'
import { FnbDish, FnbPropertyDish } from '../../../models/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../../middlewares/s3/index.js'

export async function getAllDishes(req: Request, res: Response): Promise<void> {
  try {
    const dishes = await FnbDish.findAll({
      include: [
        {
          model: FnbPropertyDish,
          as: 'propertyDishes',
          attributes: ['id', 'locId', 'price', 'isAvailable'],
        },
      ],
      order: [
        ['category', 'ASC'],
        ['name', 'ASC'],
      ],
    })
    res.status(200).json({
      success: true,
      data: dishes,
    })
  } catch (error) {
    console.error('Error fetching dishes:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch dishes' })
  }
}

export async function createDish(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, category, dietaryType, description, basePrice, nutritionalInfo, imageUrl, isActive, propertyIds } =
      req.body

    let finalImageUrl: string | null = imageUrl || null
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'fnb/dishes')
      finalImageUrl = s3Res.location
    } else if (finalImageUrl) {
      finalImageUrl = await uploadBase64ToS3(finalImageUrl, 'fnb/dishes')
    }

    const dish = await FnbDish.create({
      name,
      category,
      dietaryType,
      description: description || null,
      basePrice: Number(basePrice) || 0,
      nutritionalInfo: nutritionalInfo
        ? typeof nutritionalInfo === 'string'
          ? JSON.parse(nutritionalInfo)
          : nutritionalInfo
        : null,
      imageUrl: finalImageUrl,
      isActive: isActive !== undefined ? String(isActive) === 'true' || isActive === true : true,
      createdBy: req.user?.id || null,
    })

    // Parse propertyIds if passed in FormData
    let parsedPropIds: string[] = []
    if (Array.isArray(propertyIds)) {
      parsedPropIds = propertyIds
    } else if (typeof propertyIds === 'string' && propertyIds.trim()) {
      try {
        parsedPropIds = JSON.parse(propertyIds)
      } catch {
        parsedPropIds = [propertyIds]
      }
    }

    if (parsedPropIds.length > 0) {
      for (const locId of parsedPropIds) {
        await FnbPropertyDish.findOrCreate({
          where: { locId, dishId: dish.id },
          defaults: {
            locId,
            dishId: dish.id,
            price: Number(basePrice) || 0,
            isAvailable: true,
            createdBy: req.user?.id || null,
          },
        })
      }
    }

    res.status(201).json({
      success: true,
      message: 'Dish created successfully',
      data: dish,
    })
  } catch (error) {
    console.error('Error creating dish:', error)
    res.status(500).json({ success: false, message: 'Failed to create dish' })
  }
}

export async function updateDish(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { name, category, dietaryType, description, basePrice, nutritionalInfo, imageUrl, isActive, propertyIds } =
      req.body

    const dish = await FnbDish.findByPk(id)
    if (!dish) {
      res.status(404).json({ success: false, message: 'Dish not found' })
      return
    }

    let finalImageUrl = dish.imageUrl
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'fnb/dishes')
      finalImageUrl = s3Res.location
    } else if (imageUrl !== undefined) {
      finalImageUrl = await uploadBase64ToS3(imageUrl, 'fnb/dishes')
    }

    await dish.update({
      name: name || dish.name,
      category: category || dish.category,
      dietaryType: dietaryType || dish.dietaryType,
      description: description !== undefined ? description : dish.description,
      basePrice: basePrice !== undefined ? Number(basePrice) : dish.basePrice,
      nutritionalInfo: nutritionalInfo
        ? typeof nutritionalInfo === 'string'
          ? JSON.parse(nutritionalInfo)
          : nutritionalInfo
        : dish.nutritionalInfo,
      imageUrl: finalImageUrl,
      isActive: isActive !== undefined ? String(isActive) === 'true' || isActive === true : dish.isActive,
      updatedBy: req.user?.id || null,
    })

    // Parse propertyIds if passed in FormData
    if (propertyIds !== undefined) {
      let parsedPropIds: string[] = []
      if (Array.isArray(propertyIds)) {
        parsedPropIds = propertyIds
      } else if (typeof propertyIds === 'string' && propertyIds.trim()) {
        try {
          parsedPropIds = JSON.parse(propertyIds)
        } catch {
          parsedPropIds = [propertyIds]
        }
      }

      // Sync property assignments
      for (const locId of parsedPropIds) {
        const [propDish] = await FnbPropertyDish.findOrCreate({
          where: { locId, dishId: dish.id },
          defaults: {
            locId,
            dishId: dish.id,
            price: Number(basePrice) || dish.basePrice,
            isAvailable: true,
            createdBy: req.user?.id || null,
          },
        })
        if (!propDish.isAvailable) {
          await propDish.update({ isAvailable: true })
        }
      }

      // Deactivate unselected properties
      const existingPropDishes = await FnbPropertyDish.findAll({ where: { dishId: dish.id } })
      for (const epd of existingPropDishes) {
        if (!parsedPropIds.includes(epd.locId)) {
          await epd.update({ isAvailable: false })
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Dish updated successfully',
      data: dish,
    })
  } catch (error) {
    console.error('Error updating dish:', error)
    res.status(500).json({ success: false, message: 'Failed to update dish' })
  }
}

export async function getPropertyDishes(req: Request, res: Response): Promise<void> {
  try {
    const locId = req.params.locId as string
    const propertyDishes = await FnbPropertyDish.findAll({
      where: { locId, isAvailable: true },
      include: [{ model: FnbDish, as: 'dish' }],
    })
    res.status(200).json({
      success: true,
      data: propertyDishes,
    })
  } catch (error) {
    console.error('Error fetching property dishes:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch property dishes' })
  }
}

export async function setPropertyDishOverride(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { locId, dishId, price, isAvailable } = req.body

    const existing = await FnbPropertyDish.findOne({ where: { locId, dishId } })

    if (existing) {
      await existing.update({
        price: price !== undefined ? price : existing.price,
        isAvailable: isAvailable !== undefined ? isAvailable : existing.isAvailable,
        updatedBy: req.user?.id || null,
      })
      res.status(200).json({
        success: true,
        message: 'Property dish pricing updated',
        data: existing,
      })
      return
    }

    const created = await FnbPropertyDish.create({
      locId,
      dishId,
      price: price || 0,
      isAvailable: isAvailable !== undefined ? isAvailable : true,
      createdBy: req.user?.id || null,
    })

    res.status(201).json({
      success: true,
      message: 'Property dish pricing set',
      data: created,
    })
  } catch (error) {
    console.error('Error setting property dish price:', error)
    res.status(500).json({ success: false, message: 'Failed to set property dish price' })
  }
}
