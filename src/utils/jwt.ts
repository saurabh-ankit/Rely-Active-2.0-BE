import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'rely-active-super-secret-jwt-key-2026'

export interface JwtPayloadData {
  userId: string
  email?: string | null
  companyId?: string | null
  defaultLocationId?: string | null
  roles: string[]
}

export function generateToken(payload: JwtPayloadData): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayloadData {
  return jwt.verify(token, JWT_SECRET) as JwtPayloadData
}
