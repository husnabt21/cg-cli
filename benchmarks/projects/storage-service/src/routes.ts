import { DocumentService } from './service';
import { requireAuth, handleError } from './middleware';

const service = new DocumentService();

export function createDocumentHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    const record = service.create(req.body);
    res.status(201).json(record);
  } catch (err) {
    handleError(err, res);
  }
}

export function getDocumentHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.get(req.params.id));
  } catch (err) {
    handleError(err, res);
  }
}

export function renameDocumentHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.rename(req.params.id, req.body.name));
  } catch (err) {
    handleError(err, res);
  }
}

export function deleteDocumentHandler(req: any, res: any): void {
  try {
    requireAuth(req);
    service.remove(req.params.id);
    res.status(204).json(null);
  } catch (err) {
    handleError(err, res);
  }
}

export const routes = [
  { method: 'POST', path: '/documents', handler: createDocumentHandler },
  { method: 'GET', path: '/documents/:id', handler: getDocumentHandler },
  { method: 'PUT', path: '/documents/:id', handler: renameDocumentHandler },
  { method: 'DELETE', path: '/documents/:id', handler: deleteDocumentHandler },
];
