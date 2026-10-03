import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { Task } from './model';

const records: Task[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insertTask(record: Task): Task {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function findTaskById(id: string): Task {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('Task not found');
  }
  return found;
}

export function updateTask(id: string, changes: Partial<Task>): Task {
  const record = findTaskById(id);
  Object.assign(record, changes);
  return record;
}

export function deleteTask(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('Task not found');
  }
  records.splice(index, 1);
}

export function listTasks(): Task[] {
  return records.slice();
}
