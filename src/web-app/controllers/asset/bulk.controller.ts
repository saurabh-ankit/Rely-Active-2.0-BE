import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import XLSX from 'xlsx'
import { Asset, AssetCategory, AssetItem, AssetVendor, Property } from '../../../models/index.js'
import { AppError } from '../../../utils/appError.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'

export const generateBulkAssetTemplate = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { categoryId, itemId, vendorId, numberOfRecords = 10 } = req.body

    const category = await AssetCategory.findByPk(categoryId)
    if (!category) {
      throw new AppError('Category not found', 404)
    }

    const item = await AssetItem.findByPk(itemId)
    if (!item) {
      throw new AppError('Item not found', 404)
    }

    let vendor: AssetVendor | null = null
    if (vendorId) {
      vendor = await AssetVendor.findByPk(vendorId)
      if (!vendor) {
        throw new AppError('Vendor not found', 404)
      }
    }

    const sampleRows: Record<string, unknown>[] = []
    const numRows = Math.min(Math.max(1, Number(numberOfRecords)), 1000)

    for (let i = 1; i <= numRows; i++) {
      const serialNum = `SN-${item.name.substring(0, 3).toUpperCase()}-${String(i).padStart(4, '0')}`
      const assetTag = `TAG-${String(i).padStart(5, '0')}`

      sampleRows.push({
        'Serial Number': serialNum,
        'Asset Tag': assetTag,
        'QR Code': `QR-${assetTag}`,
        'Purchase Date (YYYY-MM-DD)': new Date().toISOString().split('T')[0],
        'Purchase Price': 1000,
        'Current Value': 1000,
        'Warranty End Date (YYYY-MM-DD)': new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        'Condition (excellent/good/fair/poor)': 'good',
        'Status (available/assigned/maintenance/retired/disposed)': 'available',
        Notes: `Bulk imported asset #${i}`,
      })
    }

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(sampleRows)

    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 },
      { wch: 35 },
      { wch: 45 },
      { wch: 30 },
    ]

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bulk Asset Import')

    const metadataRows = [
      { Parameter: 'Category ID', Value: categoryId },
      { Parameter: 'Category Name', Value: category.name },
      { Parameter: 'Item ID', Value: itemId },
      { Parameter: 'Item Name', Value: item.name },
      { Parameter: 'Vendor ID', Value: vendorId || 'N/A' },
      { Parameter: 'Vendor Name', Value: vendor ? vendor.name : 'N/A' },
      { Parameter: 'Generated At', Value: new Date().toISOString() },
    ]
    const metadataSheet = XLSX.utils.json_to_sheet(metadataRows)
    XLSX.utils.book_append_sheet(workbook, metadataSheet, '_Metadata')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Bulk_Asset_Template_${item.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`,
    )

    return res.send(buffer)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error generating template:', error)
    return res.status(500).json(errorResponse('Failed to generate template'))
  }
}

export const processBulkAssetUpload = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded', 400)
    }

    const { categoryId, itemId, vendorId, locationId } = req.body

    if (!categoryId || !itemId || !locationId) {
      throw new AppError('categoryId, itemId, and locationId are required', 400)
    }

    const category = await AssetCategory.findByPk(categoryId)
    if (!category) {
      throw new AppError('Category not found', 404)
    }

    const item = await AssetItem.findByPk(itemId)
    if (!item) {
      throw new AppError('Item not found', 404)
    }

    const location = await Property.findByPk(locationId)
    if (!location) {
      throw new AppError('Location not found', 404)
    }

    if (vendorId) {
      const vendor = await AssetVendor.findByPk(vendorId)
      if (!vendor) {
        throw new AppError('Vendor not found', 404)
      }
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      throw new AppError('Excel file has no valid sheets', 400)
    }
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) {
      throw new AppError('Worksheet not found in Excel file', 400)
    }

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet)

    if (!rows || rows.length === 0) {
      throw new AppError('Excel file is empty or has no valid data', 400)
    }

    const createdAssets: unknown[] = []
    const errors: { row: number; error: string }[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      const rowNum = i + 2

      try {
        const serialNumber = row['Serial Number'] ? String(row['Serial Number']).trim() : null
        const assetTag = row['Asset Tag'] ? String(row['Asset Tag']).trim() : null
        const qrCode = row['QR Code'] ? String(row['QR Code']).trim() : null
        const purchaseDateStr = row['Purchase Date (YYYY-MM-DD)']
          ? String(row['Purchase Date (YYYY-MM-DD)']).trim()
          : null
        const purchasePrice = row['Purchase Price'] ? Number(row['Purchase Price']) : null
        const currentValue = row['Current Value'] ? Number(row['Current Value']) : purchasePrice
        const warrantyEndDateStr = row['Warranty End Date (YYYY-MM-DD)']
          ? String(row['Warranty End Date (YYYY-MM-DD)']).trim()
          : null
        const condition = row['Condition (excellent/good/fair/poor)']
          ? String(row['Condition (excellent/good/fair/poor)']).trim().toLowerCase()
          : 'good'
        const status = row['Status (available/assigned/maintenance/retired/disposed)']
          ? String(row['Status (available/assigned/maintenance/retired/disposed)']).trim().toLowerCase()
          : 'available'
        const notes = row['Notes'] ? String(row['Notes']).trim() : null

        const validConditions = ['excellent', 'good', 'fair', 'poor']
        if (!validConditions.includes(condition)) {
          errors.push({
            row: rowNum,
            error: `Invalid condition '${condition}'. Must be one of: ${validConditions.join(', ')}`,
          })
          continue
        }

        const validStatuses = ['available', 'assigned', 'maintenance', 'retired', 'disposed']
        if (!validStatuses.includes(status)) {
          errors.push({
            row: rowNum,
            error: `Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`,
          })
          continue
        }

        let purchaseDate: Date | null = null
        if (purchaseDateStr) {
          purchaseDate = new Date(purchaseDateStr)
          if (isNaN(purchaseDate.getTime())) {
            errors.push({
              row: rowNum,
              error: `Invalid purchase date format '${purchaseDateStr}'`,
            })
            continue
          }
        }

        let warrantyEndDate: Date | null = null
        if (warrantyEndDateStr) {
          warrantyEndDate = new Date(warrantyEndDateStr)
          if (isNaN(warrantyEndDate.getTime())) {
            errors.push({
              row: rowNum,
              error: `Invalid warranty end date format '${warrantyEndDateStr}'`,
            })
            continue
          }
        }

        const asset = await Asset.create({
          itemId,
          locationId,
          vendorId: vendorId || null,
          serialNumber,
          assetTag,
          qrCode,
          purchaseDate,
          purchasePrice,
          currentValue,
          warrantyEndDate,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          condition: condition as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: status as any,
          notes,
          createdBy: req.user?.id || null,
        })

        createdAssets.push(asset)
      } catch (rowError: unknown) {
        const err = rowError as Error
        errors.push({
          row: rowNum,
          error: err.message || 'Failed to process row',
        })
      }
    }

    return res.status(200).json(
      successResponse('Bulk upload completed', {
        totalProcessed: rows.length,
        successfullyCreated: createdAssets.length,
        failedCount: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
    )
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error processing bulk upload:', error)
    return res.status(500).json(errorResponse('Failed to process bulk upload'))
  }
}
