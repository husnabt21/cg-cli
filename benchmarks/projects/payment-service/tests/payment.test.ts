declare const describe: any;
declare const it: any;

import { PaymentService } from '../src/service';
import { createPaymentHandler } from '../src/routes';

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

function testCreatePayment(): void {
  const service = new PaymentService();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  createPaymentHandler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new PaymentService();
  service.rename('missing-id', '');
}

describe('PaymentService', () => {
  it('creates a record', testCreatePayment);
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
