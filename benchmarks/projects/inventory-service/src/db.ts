import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { Item } from './model';

const records: Item[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insertItem(record: Item): Item {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function findItemById(id: string): Item {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('Item not found');
  }
  return found;
}

export function updateItem(id: string, changes: Partial<Item>): Item {
  const record = findItemById(id);
  Object.assign(record, changes);
  return record;
}

export function deleteItem(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('Item not found');
  }
  records.splice(index, 1);
}

export function listItems(): Item[] {
  return records.slice();
}
