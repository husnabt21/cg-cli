import { NotificationService } from './service';
import { requireAuth, handleError } from './middleware';

const service = new NotificationService();

export function createNotificationHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    const record = service.create(req.body);
    res.status(201).json(record);
  } catch (err) {
    handleError(err, res);
  }
}

export function getNotificationHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.get(req.params.id));
  } catch (err) {
    handleError(err, res);
  }
}

export function renameNotificationHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.rename(req.params.id, req.body.name));
  } catch (err) {
    handleError(err, res);
  }
}

export function deleteNotificationHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    service.remove(req.params.id);
    res.status(204).json(null);
  } catch (err) {
    handleError(err, res);
  }
}

export const routes = [
  { method: 'POST', path: '/notifications', handler: createNotificationHandler },
  { method: 'GET', path: '/notifications/:id', handler: getNotificationHandler },
  { method: 'PUT', path: '/notifications/:id', handler: renameNotificationHandler },
  { method: 'DELETE', path: '/notifications/:id', handler: deleteNotificationHandler },
];
