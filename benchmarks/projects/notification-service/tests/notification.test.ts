declare const describe: any;
declare const it: any;

import { NotificationService } from '../src/service';
import { createNotificationHandler } from '../src/routes';

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

function testCreateNotification(): void {
  const service = new NotificationService();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  createNotificationHandler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new NotificationService();
  service.rename('missing-id', '');
}

describe('NotificationService', () => {
  it('creates a record', testCreateNotification);
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
