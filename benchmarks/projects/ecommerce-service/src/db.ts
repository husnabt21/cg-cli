import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { Order } from './model';

const records: Order[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insertOrder(record: Order): Order {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function findOrderById(id: string): Order {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('Order not found');
  }
  return found;
}

export function updateOrder(id: string, changes: Partial<Order>): Order {
  const record = findOrderById(id);
  Object.assign(record, changes);
  return record;
}

export function deleteOrder(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('Order not found');
  }
  records.splice(index, 1);
}

export function listOrders(): Order[] {
  return records.slice();
}
