import { Task } from './model';
import { insertTask, findTaskById, updateTask, deleteTask, listTasks } from './db';
import { sanitizeName, validateTaskInput } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, Task>();

export class TaskService {
  create(input: { name: string; ownerId: string }): Task {
    validateTaskInput(input);
    const record: Task = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insertTask(record);
  }

  get(id: string): Task {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as Task;
    }
    const record = findTaskById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): Task {
    validateTaskInput({ name, ownerId: id });
    cache.delete(id);
    return updateTask(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      deleteTask(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of listTasks()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
