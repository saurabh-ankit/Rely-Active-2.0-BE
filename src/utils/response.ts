export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ErrorResponse {
  success: false;
  message: string;
  code?: string;
  errors?: unknown;
}

export function successResponse<T>(
  data: T,
  message = "Success",
  meta?: PaginationMeta
): SuccessResponse<T> {
  return { success: true, message, data, ...(meta ? { meta } : {}) };
}

export function errorResponse(
  message: string,
  code?: string,
  errors?: unknown
): ErrorResponse {
  return {
    success: false,
    message,
    ...(code ? { code } : {}),
    ...(errors ? { errors } : {}),
  };
}
