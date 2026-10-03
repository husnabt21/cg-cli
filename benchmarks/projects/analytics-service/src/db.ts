import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { Event } from './model';

const records: Event[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insertEvent(record: Event): Event {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function findEventById(id: string): Event {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('Event not found');
  }
  return found;
}

export function updateEvent(id: string, changes: Partial<Event>): Event {
  const record = findEventById(id);
  Object.assign(record, changes);
  return record;
}

export function deleteEvent(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('Event not found');
  }
  records.splice(index, 1);
}

export function listEvents(): Event[] {
  return records.slice();
}
