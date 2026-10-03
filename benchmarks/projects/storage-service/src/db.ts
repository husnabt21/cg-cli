import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { Document } from './model';

const records: Document[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insertDocument(record: Document): Document {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function findDocumentById(id: string): Document {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('Document not found');
  }
  return found;
}

export function updateDocument(id: string, changes: Partial<Document>): Document {
  const record = findDocumentById(id);
  Object.assign(record, changes);
  return record;
}

export function deleteDocument(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('Document not found');
  }
  records.splice(index, 1);
}

export function listDocuments(): Document[] {
  return records.slice();
}
