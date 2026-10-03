import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { Payment } from './model';

const records: Payment[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insertPayment(record: Payment): Payment {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function findPaymentById(id: string): Payment {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('Payment not found');
  }
  return found;
}

export function updatePayment(id: string, changes: Partial<Payment>): Payment {
  const record = findPaymentById(id);
  Object.assign(record, changes);
  return record;
}

export function deletePayment(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('Payment not found');
  }
  records.splice(index, 1);
}

export function listPayments(): Payment[] {
  return records.slice();
}
