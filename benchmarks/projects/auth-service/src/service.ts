import { Account } from './model';
import { insertAccount, findAccountById, updateAccount, deleteAccount, listAccounts } from './db';
import { sanitizeName, validateAccountInput } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, Account>();

export class AccountService {
  create(input: { name: string; ownerId: string }): Account {
    validateAccountInput(input);
    const record: Account = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insertAccount(record);
  }

  get(id: string): Account {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as Account;
    }
    const record = findAccountById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): Account {
    validateAccountInput({ name, ownerId: id });
    cache.delete(id);
    return updateAccount(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      deleteAccount(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of listAccounts()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
