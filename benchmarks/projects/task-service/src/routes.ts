import { TaskService } from './service';
import { requireAuth, handleError } from './middleware';

const service = new TaskService();

export function createTaskHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    const record = service.create(req.body);
    res.status(201).json(record);
  } catch (err) {
    handleError(err, res);
  }
}

export function getTaskHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.get(req.params.id));
  } catch (err) {
    handleError(err, res);
  }
}

export function renameTaskHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.rename(req.params.id, req.body.name));
  } catch (err) {
    handleError(err, res);
  }
}

export function deleteTaskHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    service.remove(req.params.id);
    res.status(204).json(null);
  } catch (err) {
    handleError(err, res);
  }
}

export const routes = [
  { method: 'POST', path: '/tasks', handler: createTaskHandler },
  { method: 'GET', path: '/tasks/:id', handler: getTaskHandler },
  { method: 'PUT', path: '/tasks/:id', handler: renameTaskHandler },
  { method: 'DELETE', path: '/tasks/:id', handler: deleteTaskHandler },
];
