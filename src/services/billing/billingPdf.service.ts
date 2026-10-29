import { InvoiceDocumentType, RECURRING_SERVICE_TYPES, ServiceType } from '../../enums/billing.enum.js'
import { uploadFileToS3 } from '../../middlewares/s3/index.js'
import {
  Company,
  Invoice,
  InvoiceDocument,
  Property,
  PropertyUnit,
  Receipt,
  ReceiptAllocation,
  ServicesInvoice,
  UserDetail,
} from '../../models/index.js'
import { allocationInclude, receiptAppliedTo, type AllocationWithInvoice } from './billingQuery.service.js'
import { roundMoney } from '../../utils/billing/dates.js'
import { amountInWords, escapeHtml as esc, renderPdf } from '../../utils/billing/pdf.js'
import { BillingError } from './context.js'

const LOGO = '__COMPANY_LOGO__'
const SIGNATURE = '__ACCOUNTANT_SIGNATURE__'

const SECTION_LABEL: Record<ServiceType, string> = {
  [ServiceType.RENT]: 'Rent',
  [ServiceType.CARE_PACKAGE]: 'Care Package',
  [ServiceType.FOOD_PACKAGE]: 'Food Package',
  [ServiceType.FOOD_ORDER]: 'Food Orders',
  [ServiceType.ADDITIONAL_TASK]: 'Care Services',
  [ServiceType.DOCTOR_CONSULTATION]: 'Doctor Consultations',
  [ServiceType.LAB_TEST]: 'Lab Tests',
  [ServiceType.INVENTORY_ITEM]: 'Medicines & Consumables',
  [ServiceType.EVENT_FEE]: 'Events',
  [ServiceType.VENUE_BOOKING]: 'Venue Bookings',
  [ServiceType.AMENITY_BOOKING]: 'Amenity Bookings',
  [ServiceType.MAINTENANCE]: 'Maintenance',
  [ServiceType.MISCELLANEOUS_AS_SERVICE]: 'Miscellaneous',
  [ServiceType.MISCELLANEOUS_AT_BILLING]: 'Miscellaneous',
  [ServiceType.CARRY_FORWARD]: 'Previous Pending Invoices',
}

const STYLES = `
  @page { size: A4; margin: 12mm 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; line-height: 1.45; color: #1f2f5c; }
  table.master { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.data { table-layout: fixed; }
  td, th { word-wrap: break-word; }
  thead.master-head { display: table-header-group; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 18px; }
  .company { max-width: 55%; font-size: 10px; color: #374151; }
  .company .name { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 3px; }
  .brand { text-align: right; font-size: 10px; color: #4b5563; }
  .logo { max-width: 150px; max-height: 110px; object-fit: contain; display: block; margin: 0 0 6px auto; }
  .to { margin-bottom: 16px; }
  .to .label { font-weight: 700; margin-bottom: 4px; }
  .title { text-align: center; font-weight: 700; font-size: 14px; text-decoration: underline; text-transform: uppercase; margin: 14px 0 16px; }
  .salutation { margin-bottom: 12px; }
  .intro { margin-bottom: 18px; text-align: justify; }
  table.data { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  table.data th, table.data td { border: 1px solid #6b7280; padding: 6px 8px; vertical-align: top; }
  table.data th { font-weight: 700; text-transform: uppercase; font-size: 10px; text-align: center; }
  .r { text-align: right; } .c { text-align: center; } .b { font-weight: 700; }
  .grey { background: #eeeeee; } .rule { border-top: 2px solid #333 !important; }
  .muted { color: #6b7280; font-size: 9.5px; }
  .who { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 8px; font-size: 9px; font-weight: 600; }
  .who.res { background: #e0f2fe; color: #075985; }
  .who.fam { background: #f3e8ff; color: #6b21a8; }
  .bank { margin-top: 22px; font-size: 10px; } .bank .label { font-weight: 700; margin-bottom: 8px; }
  .bank div { margin-bottom: 2px; }
  .closing { margin-top: 26px; }
  .sig { max-width: 150px; max-height: 60px; object-fit: contain; display: block; margin: 12px 0 6px; }
  .page-break { page-break-before: always; }
  .section { font-weight: 700; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #6b7280; padding-bottom: 3px; margin: 8px 0 10px; }
  .stamp { display: inline-block; padding: 4px 10px; border: 2px solid #157347; color: #157347; font-weight: bold; border-radius: 4px; }
`

/**
 * "Resident: Shyamal Jha" / "Family member: Radha Jha (Spouse)" tag after a line's name, and
 * "From old flat B-12" on a charge carried over after the resident moved.
 */
const consumerTag = (s: ServicesInvoice) =>
  (s.consumerName
    ? `<span class="who ${s.consumerType === 'FAMILY_MEMBER' ? 'fam' : 'res'}">${
        s.consumerType === 'FAMILY_MEMBER' ? 'Family member' : 'Resident'
      }: ${esc(s.consumerName)}</span>`
    : '') + (s.fromUnit ? `<span class="who">From old flat ${esc(s.fromUnit.unit_number)}</span>` : '')

const dmy = (value: Date | string | null | undefined) => {
  if (!value) return ''
  const day = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
  return `${day.slice(8, 10)}-${day.slice(5, 7)}-${day.slice(0, 4)}`
}
const money = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const monthName = (day: string) =>
  new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const docShell = (title: string, header: string, body: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLES}</style></head>
<body><table class="master"><thead class="master-head"><tr><td>${header}</td></tr></thead>
<tbody><tr><td>${body}</td></tr></tbody></table></body></html>`

/** Company letterhead, repeated on every page: details left, logo + date + GST right. */
const header = (company: Company | null, date: Date | string) => `
  <div class="header">
    <div class="company">
      <div class="name">${esc(company?.company_name || '')}</div>
      ${company?.company_head_office_address ? `<div>${esc(company.company_head_office_address)}</div>` : ''}
      ${
        company?.contact_number || company?.alternate_contact_number
          ? `<div>Phone: ${esc([company?.contact_number, company?.alternate_contact_number].filter(Boolean).join(', '))}</div>`
          : ''
      }
      ${company?.email_id ? `<div>Email: ${esc(company.email_id)}</div>` : ''}
    </div>
    <div class="brand">
      ${company?.document_path ? `<img class="logo" src="${LOGO}" alt="">` : ''}
      <div>Date: ${dmy(date)}</div>
      ${company?.company_gst_number ? `<div>GST No: ${esc(company.company_gst_number)}</div>` : ''}
    </div>
  </div>`

const closing = (company: Company | null) => `
  <div class="closing">
    <p>Thanks &amp; regards,</p>
    ${company?.accountant_signature ? `<img class="sig" src="${SIGNATURE}" alt="">` : '<br><br>'}
    <b>${esc(company?.accountant_name || company?.company_name || '')}</b>
    ${company?.accountant_name && company?.company_name ? `<div class="muted">${esc(company.company_name)}</div>` : ''}
  </div>`

const bankDetails = (company: Company | null) =>
  company?.account_no
    ? `<div class="bank"><div class="label">Kindly pay online to our Bank Account details as below,</div>
        <div>Company Name: ${esc(company.company_name)}</div>
        <div>Account No: ${esc(company.account_no)}</div>
        <div>IFSC Code: ${esc(company.ifsc_code)}</div>
        <div>Branch: ${esc(company.branch_name)}</div>
        <div>Bank: ${esc(company.bank_name)}</div></div>`
    : ''

const images = (company: Company | null) => ({
  [LOGO]: company?.document_path ?? null,
  [SIGNATURE]: company?.accountant_signature ?? null,
})

function invoiceHtml(
  invoice: Invoice,
  services: ServicesInvoice[],
  company: Company | null,
  property: Property | null,
): string {
  const billToName = invoice.billToName || 'Resident'
  const isRecurring = (s: ServicesInvoice) =>
    (RECURRING_SERVICE_TYPES as readonly ServiceType[]).includes(s.serviceType) && !s.isAdjustment
  const isCarried = (s: ServicesInvoice) => s.serviceType === ServiceType.CARRY_FORWARD
  const recurring = services.filter(isRecurring)
  const carried = services.filter(isCarried)
  const others = services.filter((s) => !isRecurring(s) && !isCarried(s))

  // Particulars: each rent / package line in full, other charges grouped by kind.
  const grouped = new Map<string, number>()
  for (const s of others) {
    const label = SECTION_LABEL[s.serviceType]
    grouped.set(label, roundMoney((grouped.get(label) ?? 0) + Number(s.total)))
  }
  const particulars = [
    ...recurring.map((s) => ({
      label: `${esc(s.name)}${s.description ? ` – ${esc(s.description)}` : ''}${consumerTag(s)}`,
      amount: Number(s.total),
    })),
    ...[...grouped].map(([label, amount]) => ({ label: esc(label), amount })),
  ]

  const usageDates = others
    .map((s) => s.serviceStartDate)
    .filter((d): d is string => !!d)
    .sort()
  const servicesMonth = usageDates.length ? monthName(usageDates[0]!) : null
  const carriedTotal = Number(invoice.carriedForwardAmount)
  const address = [property?.property_name, property?.street, property?.city, property?.state, property?.pincode]
    .filter(Boolean)
    .join(', ')

  const breakupRows = (rows: ServicesInvoice[]) =>
    rows
      .map(
        (s, i) => `<tr>
          <td class="c">${i + 1}</td>
          <td class="c">${esc(s.serviceStartDate === s.serviceEndDate ? dmy(s.serviceStartDate) : `${dmy(s.serviceStartDate)} to ${dmy(s.serviceEndDate)}`)}</td>
          <td>${esc(s.name)}${consumerTag(s)}${s.description ? `<div class="muted">${esc(s.description)}</div>` : ''}</td>
          <td class="c">${Number(s.quantity) === 0 ? 'N/A' : Number(s.quantity)}</td>
          <td class="r">${money(Number(s.price))}</td>
          <td class="r">${money(Number(s.total))}</td>
        </tr>`,
      )
      .join('')
  const breakupTable = (rows: ServicesInvoice[], empty: string) => `
    <table class="data">
      <thead><tr><th style="width:44px">Sr. No</th><th style="width:96px">Date</th><th>Item Name</th><th style="width:54px">Qty</th><th style="width:80px">Rate</th><th style="width:86px">Total</th></tr></thead>
      <tbody>${rows.length ? breakupRows(rows) : `<tr><td colspan="6" class="c">${empty}</td></tr>`}</tbody>
    </table>`

  const body = `
    <div class="to">
      <div class="label">To</div>
      <div>Dear ${esc(billToName)}</div>
      <div>Resident Name: ${esc(invoice.billToName || '')}</div>
      <div>Flat: ${esc(invoice.billToUnitNumber || '')}${address ? `, ${esc(address)}` : ''}</div>
      ${invoice.billToPhone ? `<div>Phone: ${esc(invoice.billToPhone)}</div>` : ''}
      <div>Invoice No: ${esc(invoice.invoiceNumber)}</div>
      ${invoice.dueDate ? `<div>Due Date: ${dmy(invoice.dueDate)}</div>` : ''}
    </div>

    <div class="title">Invoice</div>
    <div class="salutation">Dear ${esc(billToName)},</div>
    <div class="intro">
      Please find below the invoice for your stay from ${dmy(invoice.startDate)} to ${dmy(invoice.endDate)}
      in ${monthName(String(invoice.startDate))}.${servicesMonth ? ` Please also find attached the details of services used in ${servicesMonth}.` : ''}
    </div>

    <table class="data">
      <thead><tr><th>Particulars</th><th style="width:150px">Amount</th></tr></thead>
      <tbody>
        ${particulars.map((p) => `<tr><td>${p.label}</td><td class="r">${money(p.amount)}</td></tr>`).join('')}
        <tr class="b"><td>Total Services</td><td class="r">${money(Number(invoice.subtotal))}</td></tr>
        ${
          Number(invoice.discount)
            ? `<tr><td>Discount${invoice.discountPercentage ? ` (${Number(invoice.discountPercentage)}%)` : ''}${invoice.discountReason ? ` – ${esc(invoice.discountReason)}` : ''}</td><td class="r">- ${money(Number(invoice.discount))}</td></tr>`
            : ''
        }
        <tr class="b rule"><td>Subtotal</td><td class="r">${money(roundMoney(Number(invoice.subtotal) - Number(invoice.discount)))}</td></tr>
        ${
          invoice.gstRate !== null
            ? `<tr><td>CGST @ ${Number(invoice.cgstRate)}%</td><td class="r">${money(Number(invoice.cgstAmount))}</td></tr>
               <tr><td>SGST @ ${Number(invoice.sgstRate)}%</td><td class="r">${money(Number(invoice.sgstAmount))}</td></tr>`
            : ''
        }
        ${
          carried.length
            ? `<tr class="b rule"><td>Current Month Total</td><td class="r">${money(roundMoney(Number(invoice.discountedAmount) - carriedTotal))}</td></tr>
               ${carried
                 .map(
                   (s) =>
                     `<tr><td>${esc(s.name)}<div class="muted">${esc(s.description || '')}</div></td><td class="r">${money(Number(s.total))}</td></tr>`,
                 )
                 .join('')}`
            : ''
        }
        <tr class="b grey rule"><td>Total Payable</td><td class="r">${money(Number(invoice.discountedAmount))}</td></tr>
        ${Number(invoice.paidAmount) ? `<tr><td>Less: Paid</td><td class="r">- ${money(Number(invoice.paidAmount))}</td></tr>` : ''}
        <tr class="b"><td>Net Payable</td><td class="r">${money(Number(invoice.remainingBalance))}</td></tr>
      </tbody>
    </table>

    ${bankDetails(company)}
    ${closing(company)}

    <div class="page-break"></div>
    <div class="section">Details of Services Used</div>
    ${breakupTable(others, 'No services used in this period.')}
    ${carried.length ? `<div class="section">Previous Balance Carried Forward</div>${breakupTable(carried, '')}` : ''}
  `
  return docShell(invoice.invoiceNumber, header(company, invoice.createdAt), body)
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  NET_BANKING: 'Net Banking',
  OTHER: 'Other',
}

const RECEIPT_STYLES = `
  .words { border-left: 3px solid #1f2f5c; background: #f8fafc; padding: 8px 12px; margin-bottom: 16px; }
  .two { display: flex; gap: 14px; align-items: flex-start; }
  .two > table { flex: 1; }
  table.kv td:first-child { width: 42%; color: #4b5563; }
  .row-got td { background: #ecfdf5; color: #065f46; font-weight: 700; }
  .row-due td { background: #fff7ed; color: #92400e; font-weight: 800; font-size: 12px; }
  .row-clear td { background: #ecfdf5; color: #065f46; font-weight: 800; font-size: 12px; }
`

type AppliedTo = ReturnType<typeof receiptAppliedTo>

function receiptHtml(
  receipt: Receipt,
  invoice: Invoice,
  company: Company | null,
  receivedBy: string | null,
  appliedTo: AppliedTo,
): string {
  const received = Number(receipt.paidAmount)
  const remaining = Number(receipt.invoiceRemainingBalance ?? 0)
  const invoiceTotal = Number(receipt.invoiceTotal ?? invoice.discountedAmount)
  const paidBefore = Number(receipt.paidBefore ?? 0)
  const settled = remaining <= 0
  const method = PAYMENT_METHOD_LABEL[receipt.paymentMethod] ?? receipt.paymentMethod
  const payer = invoice.billToName || 'Resident'
  return docShell(
    receipt.receiptNumber,
    header(company, receipt.createdAt),
    `<style>${RECEIPT_STYLES}</style>
    <div class="title">Payment Receipt</div>

    <div class="words">
      Received with thanks from <b>${esc(payer)}</b> (Flat ${esc(invoice.billToUnitNumber || '')}) the sum of
      <b>${esc(amountInWords(received))}</b> by ${esc(method)} against invoice <b>${esc(invoice.invoiceNumber)}</b>.
    </div>

    <div class="two">
      <table class="data kv">
        <thead><tr><th colspan="2">Receipt Details</th></tr></thead>
        <tbody>
          <tr><td>Receipt No</td><td class="b">${esc(receipt.receiptNumber)}</td></tr>
          <tr><td>Receipt Date</td><td>${dmy(receipt.createdAt)}</td></tr>
          <tr><td>Received From</td><td>${esc(payer)}</td></tr>
          <tr><td>Flat</td><td>${esc(invoice.billToUnitNumber || '')}</td></tr>
          <tr><td>Payment Method</td><td>${esc(method)}</td></tr>
          ${receipt.paymentReference ? `<tr><td>Reference</td><td>${esc(receipt.paymentReference)}</td></tr>` : ''}
          ${receivedBy ? `<tr><td>Received By</td><td>${esc(receivedBy)}</td></tr>` : ''}
        </tbody>
      </table>
      <table class="data kv">
        <thead><tr><th colspan="2">Invoice ${esc(invoice.invoiceNumber)}</th></tr></thead>
        <tbody>
          <tr><td>Billing Period</td><td>${dmy(invoice.startDate)} to ${dmy(invoice.endDate)}</td></tr>
          <tr><td>Invoice Total</td><td class="r">${money(invoiceTotal)}</td></tr>
          <tr><td>Paid Earlier</td><td class="r">${money(paidBefore)}</td></tr>
          <tr class="row-got"><td>Received Now</td><td class="r">${money(received)}</td></tr>
          <tr><td>Total Paid</td><td class="r">${money(roundMoney(paidBefore + received))}</td></tr>
          <tr class="${settled ? 'row-clear' : 'row-due'}"><td>Remaining Balance</td><td class="r">${money(remaining)}</td></tr>
        </tbody>
      </table>
    </div>

    ${
      appliedTo.some((a) => a.carried)
        ? `<table class="data">
            <thead><tr><th>Payment Applied To</th><th style="width:170px">Period</th><th style="width:110px">Amount</th></tr></thead>
            <tbody>
              ${appliedTo
                .map(
                  (a) => `<tr>
                    <td>${esc(a.invoiceNumber ?? '')} ${
                      a.carried
                        ? `<span class="muted">– previous balance carried into ${esc(invoice.invoiceNumber)}${a.status === 'PAID' ? ', now paid in full' : ''}</span>`
                        : '<span class="muted">– charges of this invoice</span>'
                    }</td>
                    <td class="c">${dmy(a.startDate)} to ${dmy(a.endDate)}</td>
                    <td class="r">${money(a.amount)}</td>
                  </tr>`,
                )
                .join('')}
              <tr class="b"><td colspan="2">Total Received</td><td class="r">${money(received)}</td></tr>
            </tbody>
          </table>`
        : ''
    }
    ${receipt.notes ? `<p class="muted" style="margin-top:4px">Notes: ${esc(receipt.notes)}</p>` : ''}
    ${settled ? '<p style="margin-top:14px"><span class="stamp">PAID IN FULL</span></p>' : bankDetails(company)}
    ${closing(company)}
  `,
  )
}

async function storePdf(
  buffer: Buffer,
  fileName: string,
  doc: { invoiceId: string; receiptId: string | null; documentType: InvoiceDocumentType },
  userId: string | null,
) {
  const uploaded = await uploadFileToS3(
    { buffer, mimetype: 'application/pdf', originalname: `${fileName}.pdf` },
    `billing/${doc.documentType.toLowerCase()}s`,
  )
  await InvoiceDocument.update({ isDeleted: true }, { where: { ...doc, isDeleted: false } })
  await InvoiceDocument.create({ ...doc, s3Url: uploaded.location, s3Key: uploaded.key, createdBy: userId })
  return uploaded.location
}

/** Renders an invoice PDF from its saved lines. */
export async function buildInvoicePdf(invoiceId: string): Promise<{ invoice: Invoice; pdf: Buffer }> {
  const invoice = await Invoice.findOne({ where: { id: invoiceId, isDeleted: false } })
  if (!invoice) throw new BillingError('Invoice not found', 404)
  // Misc lines added at billing are mirrored in services_invoice, so this is every line.
  const [services, company, property] = await Promise.all([
    ServicesInvoice.findAll({
      where: { invoiceId, isDeleted: false },
      include: [{ model: PropertyUnit, as: 'fromUnit', attributes: ['id', 'unit_number'], required: false }],
    }),
    Company.findOne({ where: { isDeleted: false } }),
    Property.findByPk(invoice.propertyId),
  ])
  const typeOrder = Object.values(ServiceType)
  services.sort(
    (a, b) =>
      typeOrder.indexOf(a.serviceType) - typeOrder.indexOf(b.serviceType) ||
      Number(a.isAdjustment) - Number(b.isAdjustment) ||
      String(a.serviceStartDate ?? '').localeCompare(String(b.serviceStartDate ?? '')) ||
      Number(a.consumerType === 'FAMILY_MEMBER') - Number(b.consumerType === 'FAMILY_MEMBER'),
  )
  const pdf = await renderPdf(invoiceHtml(invoice, services, company, property), images(company))
  return { invoice, pdf }
}

/** Returns the stored invoice PDF, generating it when missing (or stale after an edit). */
export async function ensureInvoicePdf(invoiceId: string, userId: string | null): Promise<string> {
  const existing = await InvoiceDocument.findOne({
    where: { invoiceId, documentType: InvoiceDocumentType.INVOICE, isDeleted: false },
    order: [['createdAt', 'DESC']],
  })
  if (existing) return existing.s3Url

  const { invoice, pdf } = await buildInvoicePdf(invoiceId)
  return storePdf(
    pdf,
    invoice.invoiceNumber,
    { invoiceId, receiptId: null, documentType: InvoiceDocumentType.INVOICE },
    userId,
  )
}

/** Renders a receipt PDF from the saved receipt and its invoice. */
export async function buildReceiptPdf(receipt: Receipt): Promise<{ invoice: Invoice; pdf: Buffer }> {
  const invoice = await Invoice.findByPk(receipt.invoiceId)
  if (!invoice) throw new BillingError('Invoice not found', 404)
  const [company, staff, allocations] = await Promise.all([
    Company.findOne({ where: { isDeleted: false } }),
    receipt.handedOverTo ? UserDetail.findOne({ where: { userId: receipt.handedOverTo } }) : null,
    ReceiptAllocation.findAll({ where: { receiptId: receipt.id }, include: allocationInclude.include }),
  ])
  const receivedBy = staff ? `${staff.firstName ?? ''} ${staff.lastName ?? ''}`.trim() || null : null
  const appliedTo = receiptAppliedTo(invoice.id, allocations as AllocationWithInvoice[])
  const pdf = await renderPdf(receiptHtml(receipt, invoice, company, receivedBy, appliedTo), images(company))
  return { invoice, pdf }
}

export async function ensureReceiptPdf(receiptId: string, userId: string | null, invoiceId?: string): Promise<string> {
  const receipt = await Receipt.findOne({
    where: { id: receiptId, isDeleted: false, ...(invoiceId ? { invoiceId } : {}) },
  })
  if (!receipt) throw new BillingError('Receipt not found', 404)
  const existing = await InvoiceDocument.findOne({
    where: { receiptId, documentType: InvoiceDocumentType.RECEIPT, isDeleted: false },
  })
  if (existing) return existing.s3Url

  const { invoice, pdf } = await buildReceiptPdf(receipt)
  return storePdf(
    pdf,
    receipt.receiptNumber,
    { invoiceId: invoice.id, receiptId: receipt.id, documentType: InvoiceDocumentType.RECEIPT },
    userId,
  )
}
