import { AppError } from './errors';
import { loadConfig } from './config';

export function requireAuth(req: { headers: Record<string, string | undefined> }): void {
  const key = req.headers['x-api-key'];
  if (!key || key !== loadConfig().apiKey) {
    throw new AppError('unauthorized', 401);
  }
}

export function handleError(err: unknown, res: any): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'internal error' });
}
