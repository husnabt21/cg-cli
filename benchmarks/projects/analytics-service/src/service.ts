import { Event } from './model';
import { insertEvent, findEventById, updateEvent, deleteEvent, listEvents } from './db';
import { sanitizeName, validateEventInput } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, Event>();

export class EventService {
  create(input: { name: string; ownerId: string }): Event {
    validateEventInput(input);
    const record: Event = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insertEvent(record);
  }

  get(id: string): Event {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as Event;
    }
    const record = findEventById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): Event {
    validateEventInput({ name, ownerId: id });
    cache.delete(id);
    return updateEvent(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      deleteEvent(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of listEvents()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
