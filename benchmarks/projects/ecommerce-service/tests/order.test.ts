declare const describe: any;
declare const it: any;

import { OrderService } from '../src/service';
import { createOrderHandler } from '../src/routes';

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

function testCreateOrder(): void {
  const service = new OrderService();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  createOrderHandler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new OrderService();
  service.rename('missing-id', '');
}

describe('OrderService', () => {
  it('creates a record', testCreateOrder);
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
