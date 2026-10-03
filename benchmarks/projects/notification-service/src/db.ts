import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { Notification } from './model';

const records: Notification[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insertNotification(record: Notification): Notification {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function findNotificationById(id: string): Notification {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('Notification not found');
  }
  return found;
}

export function updateNotification(id: string, changes: Partial<Notification>): Notification {
  const record = findNotificationById(id);
  Object.assign(record, changes);
  return record;
}

export function deleteNotification(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('Notification not found');
  }
  records.splice(index, 1);
}

export function listNotifications(): Notification[] {
  return records.slice();
}
