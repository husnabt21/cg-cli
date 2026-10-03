import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { Account } from './model';

const records: Account[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insertAccount(record: Account): Account {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function findAccountById(id: string): Account {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('Account not found');
  }
  return found;
}

export function updateAccount(id: string, changes: Partial<Account>): Account {
  const record = findAccountById(id);
  Object.assign(record, changes);
  return record;
}

export function deleteAccount(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('Account not found');
  }
  records.splice(index, 1);
}

export function listAccounts(): Account[] {
  return records.slice();
}
