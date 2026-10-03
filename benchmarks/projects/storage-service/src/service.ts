import { Document } from './model';
import { insertDocument, findDocumentById, updateDocument, deleteDocument, listDocuments } from './db';
import { sanitizeName, validateDocumentInput } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, Document>();

export class DocumentService {
  create(input: { name: string; ownerId: string }): Document {
    validateDocumentInput(input);
    const record: Document = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insertDocument(record);
  }

  get(id: string): Document {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as Document;
    }
    const record = findDocumentById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): Document {
    validateDocumentInput({ name, ownerId: id });
    cache.delete(id);
    return updateDocument(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      deleteDocument(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of listDocuments()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
