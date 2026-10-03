import { Payment } from './model';
import { insertPayment, findPaymentById, updatePayment, deletePayment, listPayments } from './db';
import { sanitizeName, validatePaymentInput } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, Payment>();

export class PaymentService {
  create(input: { name: string; ownerId: string }): Payment {
    validatePaymentInput(input);
    const record: Payment = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insertPayment(record);
  }

  get(id: string): Payment {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as Payment;
    }
    const record = findPaymentById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): Payment {
    validatePaymentInput({ name, ownerId: id });
    cache.delete(id);
    return updatePayment(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      deletePayment(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of listPayments()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
