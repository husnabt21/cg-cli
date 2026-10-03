import { AccountService } from './service';
import { requireAuth, handleError } from './middleware';

const service = new AccountService();

export function createAccountHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    const record = service.create(req.body);
    res.status(201).json(record);
  } catch (err) {
    handleError(err, res);
  }
}

export function getAccountHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.get(req.params.id));
  } catch (err) {
    handleError(err, res);
  }
}

export function renameAccountHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.rename(req.params.id, req.body.name));
  } catch (err) {
    handleError(err, res);
  }
}

export function deleteAccountHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    service.remove(req.params.id);
    res.status(204).json(null);
  } catch (err) {
    handleError(err, res);
  }
}

export const routes = [
  { method: 'POST', path: '/accounts', handler: createAccountHandler },
  { method: 'GET', path: '/accounts/:id', handler: getAccountHandler },
  { method: 'PUT', path: '/accounts/:id', handler: renameAccountHandler },
  { method: 'DELETE', path: '/accounts/:id', handler: deleteAccountHandler },
];
