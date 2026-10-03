import { PaymentService } from './service';
import { requireAuth, handleError } from './middleware';

const service = new PaymentService();

export function createPaymentHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    const record = service.create(req.body);
    res.status(201).json(record);
  } catch (err) {
    handleError(err, res);
  }
}

export function getPaymentHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.get(req.params.id));
  } catch (err) {
    handleError(err, res);
  }
}

export function renamePaymentHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.rename(req.params.id, req.body.name));
  } catch (err) {
    handleError(err, res);
  }
}

export function deletePaymentHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    service.remove(req.params.id);
    res.status(204).json(null);
  } catch (err) {
    handleError(err, res);
  }
}

export const routes = [
  { method: 'POST', path: '/payments', handler: createPaymentHandler },
  { method: 'GET', path: '/payments/:id', handler: getPaymentHandler },
  { method: 'PUT', path: '/payments/:id', handler: renamePaymentHandler },
  { method: 'DELETE', path: '/payments/:id', handler: deletePaymentHandler },
];
