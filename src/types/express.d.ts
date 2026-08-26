export interface JwtUserPayload {
  userId: string;
  email: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: JwtUserPayload;
      tenantId?: string;
      userPermissions?: string[];
    }
  }
}

export {};
