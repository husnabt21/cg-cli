import { Order } from './model';
import { insertOrder, findOrderById, updateOrder, deleteOrder, listOrders } from './db';
import { sanitizeName, validateOrderInput } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, Order>();

export class OrderService {
  create(input: { name: string; ownerId: string }): Order {
    validateOrderInput(input);
    const record: Order = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insertOrder(record);
  }

  get(id: string): Order {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as Order;
    }
    const record = findOrderById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): Order {
    validateOrderInput({ name, ownerId: id });
    cache.delete(id);
    return updateOrder(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      deleteOrder(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of listOrders()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
