import { Notification } from './model';
import { insertNotification, findNotificationById, updateNotification, deleteNotification, listNotifications } from './db';
import { sanitizeName, validateNotificationInput } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, Notification>();

export class NotificationService {
  create(input: { name: string; ownerId: string }): Notification {
    validateNotificationInput(input);
    const record: Notification = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insertNotification(record);
  }

  get(id: string): Notification {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as Notification;
    }
    const record = findNotificationById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): Notification {
    validateNotificationInput({ name, ownerId: id });
    cache.delete(id);
    return updateNotification(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      deleteNotification(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of listNotifications()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
