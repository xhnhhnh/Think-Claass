import { Request, Response, NextFunction } from 'express';
import { ApiError } from './asyncHandler.js';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  // Always log full error stack for backend debugging
  console.error(`[Global Error] [${req.method}] ${req.originalUrl}`);
  console.error(err.stack || err);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Handle generic errors securely (hide stack in production)
  return res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
};
