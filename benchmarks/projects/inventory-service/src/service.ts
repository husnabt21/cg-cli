import { Item } from './model';
import { insertItem, findItemById, updateItem, deleteItem, listItems } from './db';
import { sanitizeName, validateItemInput } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, Item>();

export class ItemService {
  create(input: { name: string; ownerId: string }): Item {
    validateItemInput(input);
    const record: Item = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insertItem(record);
  }

  get(id: string): Item {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as Item;
    }
    const record = findItemById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): Item {
    validateItemInput({ name, ownerId: id });
    cache.delete(id);
    return updateItem(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      deleteItem(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of listItems()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
