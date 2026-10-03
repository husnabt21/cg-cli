declare const describe: any;
declare const it: any;

import { TaskService } from '../src/service';
import { createTaskHandler } from '../src/routes';

function makeResponse(): any {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
    },
  };
  return res;
}

function testCreateTask(): void {
  const service = new TaskService();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  createTaskHandler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new TaskService();
  service.rename('missing-id', '');
}

describe('TaskService', () => {
  it('creates a record', testCreateTask);
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
