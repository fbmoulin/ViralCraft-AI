
class ApiResponse {
  static success(data, message = 'Success') {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  static error(message, details = null, statusCode = 500) {
    const response = {
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    };
    
    if (details) {
      response.details = details;
    }
    
    return response;
  }

  static paginated(data, total, page = 1, limit = 20) {
    return {
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ApiResponse;
