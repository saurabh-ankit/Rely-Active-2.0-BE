import { ResidentDocument } from '../models/index.js'

export function formatResidentDocument(doc: ResidentDocument): Record<string, unknown> {
  return {
    id: doc.id,
    residentId: doc.residentId,
    locationId: doc.locationId,
    name: doc.name,
    fileUrl: doc.fileUrl,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    note: doc.note,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function listResidentDocumentsForResident(residentId: string) {
  const rows = await ResidentDocument.findAll({
    where: { residentId, isDeleted: false },
    order: [['createdAt', 'DESC']],
  })
  return rows.map(formatResidentDocument)
}
