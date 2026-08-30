type ApiResponse<T> = {
  success: boolean
  message: string
  data?: T
}

export const successResponse = <T>(message: string, data?: T): ApiResponse<T> => {
  if (data !== undefined) {
    return {
      success: true,
      message,
      data,
    }
  }
  return {
    success: true,
    message,
  }
}

export const errorResponse = <T>(message: string, data?: T): ApiResponse<T> => {
  if (data !== undefined) {
    return {
      success: false,
      message,
      data,
    }
  }
  return {
    success: false,
    message,
  }
}
