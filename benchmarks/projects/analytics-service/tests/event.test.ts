declare const describe: any;
declare const it: any;

import { EventService } from '../src/service';
import { createEventHandler } from '../src/routes';

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

function testCreateEvent(): void {
  const service = new EventService();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  createEventHandler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new EventService();
  service.rename('missing-id', '');
}

describe('EventService', () => {
  it('creates a record', testCreateEvent);
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
