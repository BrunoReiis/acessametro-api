import { NextFunction, Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  console.error(err);

  if (err?.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors: err.issues,
    });
  }

  if (err?.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({
      success: false,
      message: 'Erro de operação no banco de dados.',
      details: err.message,
    });
  }

  return res.status(err?.statusCode ?? 500).json({
    success: false,
    message: err?.message ?? 'Erro interno do servidor.',
  });
}
