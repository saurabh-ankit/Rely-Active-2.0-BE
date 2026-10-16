// How a resident paid for a lab test directly at the lab. A report with a payment
// method is already settled and is not billed on the flat invoice.
export enum LabPaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHEQUE = 'CHEQUE',
  UPI = 'UPI',
  NEFT = 'NEFT',
  RTGS = 'RTGS',
  CARD = 'CARD',
  OTHER = 'OTHER',
}
