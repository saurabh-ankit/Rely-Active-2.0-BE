import express from 'express'
import multer from 'multer'
import { authenticate } from '../../middlewares/authenticate.js'
import { validateRequest } from '../../middlewares/validateRequest.js'
import {
  completeServiceLogValidation,
  createAssetValidation,
  createAssignmentValidation,
  createCalibrationValidation,
  createCategoryValidation,
  createCertificationValidation,
  createInspectionValidation,
  createItemValidation,
  createServiceLogValidation,
  createTrainingValidation,
  createVendorValidation,
  createWarrantyValidation,
  deleteAssetValidation,
  deleteCalibrationValidation,
  deleteCategoryValidation,
  deleteCertificationValidation,
  deleteInspectionValidation,
  deleteItemValidation,
  deleteServiceLogValidation,
  deleteTrainingValidation,
  deleteVendorValidation,
  deleteWarrantyValidation,
  generateTemplateValidation,
  getAssetByIdValidation,
  getAssetsValidation,
  getAssignmentByIdValidation,
  getAssignmentsValidation,
  getCalibrationsValidation,
  getCategoriesValidation,
  getCategoryByIdValidation,
  getCertificationsValidation,
  getComplianceStatusValidation,
  getExpiringCertificationsValidation,
  getInspectionsValidation,
  getItemByIdValidation,
  getItemsValidation,
  getServiceLogsValidation,
  getTrainingValidation,
  getUpcomingMaintenanceValidation,
  getVendorByIdValidation,
  getVendorsValidation,
  getWarrantiesValidation,
  updateAssetValidation,
  updateAssignmentValidation,
  updateCalibrationValidation,
  updateCategoryValidation,
  updateCertificationValidation,
  updateInspectionValidation,
  updateItemValidation,
  updateServiceLogValidation,
  updateTrainingValidation,
  updateVendorValidation,
  updateWarrantyValidation,
} from '../../validations/asset.validation.js'
import {
  completeServiceLog,
  createAsset,
  createAssignment,
  createCalibration,
  createCategory,
  createCertification,
  createInspection,
  createItem,
  createServiceLog,
  createTraining,
  createVendor,
  createWarranty,
  deleteAsset,
  deleteCalibration,
  deleteCategory,
  deleteCertification,
  deleteInspection,
  deleteItem,
  deleteServiceLog,
  deleteTraining,
  deleteVendor,
  deleteWarranty,
  generateBulkAssetTemplate,
  getActiveAssignments,
  getAssetById,
  getAssetStats,
  getAssets,
  getAssignmentById,
  getAssignments,
  getBedsForRoom,
  getCalibrations,
  getCategories,
  getCategoryById,
  getCertifications,
  getComplianceStatus,
  getEmployeesForAssignment,
  getExpiringCertifications,
  getInspections,
  getItemById,
  getItems,
  getItemsDropdown,
  getPatientsForAssignment,
  getResidentsForAssignment,
  getRoomsForAssignment,
  getServiceLogs,
  getTraining,
  getUpcomingMaintenance,
  getVendorById,
  getVendors,
  getVendorsDropdown,
  getWarranties,
  processBulkAssetUpload,
  returnAsset,
  updateAsset,
  updateCalibration,
  updateCategory,
  updateCertification,
  updateInspection,
  updateItem,
  updateServiceLog,
  updateTraining,
  updateVendor,
  updateWarranty,
} from '../controllers/asset.controller.js'

const router = express.Router({ mergeParams: true })

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
})

// ==================== CATEGORY ROUTES ====================
router.post('/categories', authenticate, createCategoryValidation, validateRequest, createCategory)

router.get('/categories', authenticate, getCategoriesValidation, validateRequest, getCategories)

router.get('/categories/:id', authenticate, getCategoryByIdValidation, validateRequest, getCategoryById)

router.put('/categories/:id', authenticate, updateCategoryValidation, validateRequest, updateCategory)

router.delete('/categories/:id', authenticate, deleteCategoryValidation, validateRequest, deleteCategory)

// ==================== VENDOR ROUTES ====================
router.post('/vendors', authenticate, createVendorValidation, validateRequest, createVendor)

router.get('/vendors', authenticate, getVendorsValidation, validateRequest, getVendors)

router.get('/vendors/dropdown/list', authenticate, getVendorsDropdown)

router.get('/vendors/:id', authenticate, getVendorByIdValidation, validateRequest, getVendorById)

router.put('/vendors/:id', authenticate, updateVendorValidation, validateRequest, updateVendor)

router.delete('/vendors/:id', authenticate, deleteVendorValidation, validateRequest, deleteVendor)

// ==================== ITEM ROUTES ====================
router.post('/items', authenticate, createItemValidation, validateRequest, createItem)

router.get('/items', authenticate, getItemsValidation, validateRequest, getItems)

router.get('/items/dropdown/list', authenticate, getItemsDropdown)

router.get('/items/:id', authenticate, getItemByIdValidation, validateRequest, getItemById)

router.put('/items/:id', authenticate, updateItemValidation, validateRequest, updateItem)

router.delete('/items/:id', authenticate, deleteItemValidation, validateRequest, deleteItem)

// ==================== ASSIGNMENT ROUTES ====================
router.get('/assignments/active/list', authenticate, getActiveAssignments)

router.post('/assignments', authenticate, createAssignmentValidation, validateRequest, createAssignment)

router.get('/assignments', authenticate, getAssignmentsValidation, validateRequest, getAssignments)

router.get('/assignments/:id', authenticate, getAssignmentByIdValidation, validateRequest, getAssignmentById)

router.put('/assignments/:id/return', authenticate, updateAssignmentValidation, validateRequest, returnAsset)

// ==================== ASSIGNEE DROPDOWN ROUTES ====================
router.get('/assignees/employees', authenticate, getEmployeesForAssignment)

router.get('/assignees/residents', authenticate, getResidentsForAssignment)

router.get('/assignees/patients', authenticate, getPatientsForAssignment)

router.get('/assignees/rooms', authenticate, getRoomsForAssignment)

router.get('/assignees/beds', authenticate, getBedsForRoom)

// ==================== MAINTENANCE ROUTES ====================
router.post('/maintenance/service-logs', authenticate, createServiceLogValidation, validateRequest, createServiceLog)

router.get('/maintenance/service-logs', authenticate, getServiceLogsValidation, validateRequest, getServiceLogs)

router.put('/maintenance/service-logs/:id', authenticate, updateServiceLogValidation, validateRequest, updateServiceLog)

router.delete(
  '/maintenance/service-logs/:id',
  authenticate,
  deleteServiceLogValidation,
  validateRequest,
  deleteServiceLog,
)

router.put(
  '/maintenance/service-logs/:id/complete',
  authenticate,
  completeServiceLogValidation,
  validateRequest,
  completeServiceLog,
)

const uploadDoc = upload.fields([
  { name: 'document', maxCount: 1 },
  { name: 'file', maxCount: 1 },
])

router.post(
  '/maintenance/warranties',
  authenticate,
  uploadDoc,
  createWarrantyValidation,
  validateRequest,
  createWarranty,
)

router.get('/maintenance/warranties', authenticate, getWarrantiesValidation, validateRequest, getWarranties)

router.put(
  '/maintenance/warranties/:id',
  authenticate,
  uploadDoc,
  updateWarrantyValidation,
  validateRequest,
  updateWarranty,
)

router.delete('/maintenance/warranties/:id', authenticate, deleteWarrantyValidation, validateRequest, deleteWarranty)

router.post(
  '/maintenance/calibrations',
  authenticate,
  uploadDoc,
  createCalibrationValidation,
  validateRequest,
  createCalibration,
)

router.get('/maintenance/calibrations', authenticate, getCalibrationsValidation, validateRequest, getCalibrations)

router.put(
  '/maintenance/calibrations/:id',
  authenticate,
  uploadDoc,
  updateCalibrationValidation,
  validateRequest,
  updateCalibration,
)

router.delete(
  '/maintenance/calibrations/:id',
  authenticate,
  deleteCalibrationValidation,
  validateRequest,
  deleteCalibration,
)

router.get(
  '/maintenance/upcoming',
  authenticate,
  getUpcomingMaintenanceValidation,
  validateRequest,
  getUpcomingMaintenance,
)

// ==================== COMPLIANCE ROUTES ====================
router.post(
  '/compliance/certifications',
  authenticate,
  uploadDoc,
  createCertificationValidation,
  validateRequest,
  createCertification,
)

router.get('/compliance/certifications', authenticate, getCertificationsValidation, validateRequest, getCertifications)

router.put(
  '/compliance/certifications/:id',
  authenticate,
  uploadDoc,
  updateCertificationValidation,
  validateRequest,
  updateCertification,
)

router.delete(
  '/compliance/certifications/:id',
  authenticate,
  deleteCertificationValidation,
  validateRequest,
  deleteCertification,
)

router.post(
  '/compliance/inspections',
  authenticate,
  uploadDoc,
  createInspectionValidation,
  validateRequest,
  createInspection,
)

router.get('/compliance/inspections', authenticate, getInspectionsValidation, validateRequest, getInspections)

router.put(
  '/compliance/inspections/:id',
  authenticate,
  uploadDoc,
  updateInspectionValidation,
  validateRequest,
  updateInspection,
)

router.delete(
  '/compliance/inspections/:id',
  authenticate,
  deleteInspectionValidation,
  validateRequest,
  deleteInspection,
)

router.post('/compliance/training', authenticate, createTrainingValidation, validateRequest, createTraining)

router.get('/compliance/training', authenticate, getTrainingValidation, validateRequest, getTraining)

router.put('/compliance/training/:id', authenticate, updateTrainingValidation, validateRequest, updateTraining)

router.delete('/compliance/training/:id', authenticate, deleteTrainingValidation, validateRequest, deleteTraining)

router.get('/compliance/status', authenticate, getComplianceStatusValidation, validateRequest, getComplianceStatus)

router.get(
  '/compliance/certifications/expiring',
  authenticate,
  getExpiringCertificationsValidation,
  validateRequest,
  getExpiringCertifications,
)

// ==================== ASSET ROUTES ====================
router.get('/stats', authenticate, getAssetStats)

router.post('/', authenticate, createAssetValidation, validateRequest, createAsset)

router.get('/', authenticate, getAssetsValidation, validateRequest, getAssets)

router.get('/:id', authenticate, getAssetByIdValidation, validateRequest, getAssetById)

router.put('/:id', authenticate, updateAssetValidation, validateRequest, updateAsset)

router.delete('/:id', authenticate, deleteAssetValidation, validateRequest, deleteAsset)

// ==================== BULK UPLOAD ROUTES ====================
router.post('/bulk/template', authenticate, generateTemplateValidation, validateRequest, generateBulkAssetTemplate)

router.post('/bulk/upload', authenticate, upload.single('file'), processBulkAssetUpload)

export default router
