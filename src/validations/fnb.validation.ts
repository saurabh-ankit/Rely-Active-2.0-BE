import { z } from 'zod'

export const createGlobalPackageSchema = z
  .object({
    name: z.string().trim().min(1, 'Package name is required'),
    code: z.string().trim().min(1, 'Package code is required'),
    includedMealSlots: z.array(z.string()).min(1, 'Must include at least one meal slot'),
  })
  .passthrough()

export const assignPropertyPackageSchema = z
  .object({
    locId: z.string().uuid('Valid property ID (locId) is required'),
    globalPackageId: z.string().uuid('Valid global package ID is required'),
    price: z.number().min(0, 'Price must be non-negative'),
  })
  .passthrough()

export const assignResidentPackageSchema = z
  .object({
    residentId: z.string().uuid('Valid resident ID is required'),
    startDate: z.string().min(1, 'Valid start date is required'),
  })
  .passthrough()

export const createDishSchema = z
  .object({
    name: z.string().trim().min(1, 'Dish name is required'),
    category: z.string().trim().min(1, 'Category is required'),
    basePrice: z.number().min(0, 'Base price must be non-negative'),
  })
  .passthrough()

export const setPropertyDishSchema = z
  .object({
    locId: z.string().uuid('Valid property ID is required'),
    dishId: z.string().uuid('Valid dish ID is required'),
    price: z.number().min(0, 'Price must be non-negative'),
  })
  .passthrough()

export const createMenuSchema = z
  .object({
    locId: z.string().uuid('Valid property ID is required'),
    title: z.string().trim().min(1, 'Menu title is required'),
    startDate: z.string().min(1, 'Valid start date is required'),
    endDate: z.string().min(1, 'Valid end date is required'),
  })
  .passthrough()

export const placeOrderSchema = z
  .object({
    menuItemId: z.string().uuid('Valid menu item ID is required'),
    dishId: z.string().uuid('Valid dish ID is required'),
    date: z.string().min(1, 'Valid order date is required'),
    mealSlot: z.enum(['breakfast', 'lunch', 'snacks', 'dinner']),
    quantity: z.number().int().min(1).optional(),
  })
  .passthrough()
