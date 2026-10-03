// Run from the cg-cli folder:  node benchmarks/generate.js
// Writes benchmarks/projects/<name>/... and benchmarks/cases.json
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const PROJECTS = [
  { name: 'auth-service', E: 'Account', e: 'account' },
  { name: 'ecommerce-service', E: 'Order', e: 'order' },
  { name: 'payment-service', E: 'Payment', e: 'payment' },
  { name: 'task-service', E: 'Task', e: 'task' },
  { name: 'notification-service', E: 'Notification', e: 'notification' },
  { name: 'storage-service', E: 'Document', e: 'document' },
  { name: 'blog-service', E: 'Post', e: 'post' },
  { name: 'inventory-service', E: 'Item', e: 'item' },
  { name: 'user-service', E: 'Profile', e: 'profile' },
  { name: 'analytics-service', E: 'Event', e: 'event' },
];

// ---------- fixture source files (same shape in every project, different names) ----------
function fixtureFiles(p) {
  const E = p.E;
  const e = p.e;
  const files = {};

  files['src/config.ts'] = `declare const process: any;

export const DEFAULT_TIMEOUT_MS = 5000;
export const MAX_NAME_LENGTH = 100;

export interface AppConfig {
  dbUrl: string;
  apiKey: string;
  timeoutMs: number;
  cacheEnabled: boolean;
}

export function loadConfig(): AppConfig {
  return {
    dbUrl: process.env.DB_URL ?? 'memory://local',
    apiKey: process.env.API_KEY ?? '',
    timeoutMs: Number(process.env.TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    cacheEnabled: process.env.CACHE_ENABLED === 'true',
  };
}
`;

  files['src/errors.ts'] = `export class AppError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}
`;

  files['src/model.ts'] = `export interface ${E} {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}
`;

  files['src/db.ts'] = `import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { ${E} } from './model';

const records: ${E}[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insert${E}(record: ${E}): ${E} {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function find${E}ById(id: string): ${E} {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('${E} not found');
  }
  return found;
}

export function update${E}(id: string, changes: Partial<${E}>): ${E} {
  const record = find${E}ById(id);
  Object.assign(record, changes);
  return record;
}

export function delete${E}(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('${E} not found');
  }
  records.splice(index, 1);
}

export function list${E}s(): ${E}[] {
  return records.slice();
}
`;

  files['src/validators.ts'] = `import { MAX_NAME_LENGTH } from './config';
import { ValidationError } from './errors';

export function sanitizeName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

export function validate${E}Input(input: { name?: string; ownerId?: string }): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError('name is required');
  }
  if (!input.ownerId) {
    throw new ValidationError('ownerId is required');
  }
  if (input.name.length > MAX_NAME_LENGTH) {
    throw new ValidationError('name is too long');
  }
}
`;

  files['src/service.ts'] = `import { ${E} } from './model';
import { insert${E}, find${E}ById, update${E}, delete${E}, list${E}s } from './db';
import { sanitizeName, validate${E}Input } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, ${E}>();

export class ${E}Service {
  create(input: { name: string; ownerId: string }): ${E} {
    validate${E}Input(input);
    const record: ${E} = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insert${E}(record);
  }

  get(id: string): ${E} {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as ${E};
    }
    const record = find${E}ById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): ${E} {
    validate${E}Input({ name, ownerId: id });
    cache.delete(id);
    return update${E}(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      delete${E}(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of list${E}s()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
`;

  files['src/middleware.ts'] = `import { AppError } from './errors';
import { loadConfig } from './config';

export function requireAuth(req: { headers: Record<string, string | undefined> }): void {
  const key = req.headers['x-api-key'];
  if (!key || key !== loadConfig().apiKey) {
    throw new AppError('unauthorized', 401);
  }
}

export function handleError(err: unknown, res: any): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'internal error' });
}
`;

  files['src/routes.ts'] = `import { ${E}Service } from './service';
import { requireAuth, handleError } from './middleware';

const service = new ${E}Service();

export function create${E}Handler(req: any, res: any): void {
  try {
    requireAuth(req);
    const record = service.create(req.body);
    res.status(201).json(record);
  } catch (err) {
    handleError(err, res);
  }
}

export function get${E}Handler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.get(req.params.id));
  } catch (err) {
    handleError(err, res);
  }
}

export function rename${E}Handler(req: any, res: any): void {
  try {
    requireAuth(req);
    res.json(service.rename(req.params.id, req.body.name));
  } catch (err) {
    handleError(err, res);
  }
}

export function delete${E}Handler(req: any, res: any): void {
  try {
    requireAuth(req);
    service.remove(req.params.id);
    res.status(204).json(null);
  } catch (err) {
    handleError(err, res);
  }
}

export const routes = [
  { method: 'POST', path: '/${e}s', handler: create${E}Handler },
  { method: 'GET', path: '/${e}s/:id', handler: get${E}Handler },
  { method: 'PUT', path: '/${e}s/:id', handler: rename${E}Handler },
  { method: 'DELETE', path: '/${e}s/:id', handler: delete${E}Handler },
];
`;

  files['tests/' + e + '.test.ts'] = `declare const describe: any;
declare const it: any;

import { ${E}Service } from '../src/service';
import { create${E}Handler } from '../src/routes';

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

function testCreate${E}(): void {
  const service = new ${E}Service();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  create${E}Handler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new ${E}Service();
  service.rename('missing-id', '');
}

describe('${E}Service', () => {
  it('creates a record', testCreate${E});
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
`;

  return files;
}

// ---------- 150 case templates: 15 categories x 10 questions ----------
// Expected shorthand: cfg err mod db val svc mid rt tst = file of that name, f:<path> = a file.
// Placeholders: {E} Entity, {e} entity, {es} entities. Case n uses project n.
const FILES = {
  cfg: () => 'src/config.ts',
  err: () => 'src/errors.ts',
  mod: () => 'src/model.ts',
  db: () => 'src/db.ts',
  val: () => 'src/validators.ts',
  svc: () => 'src/service.ts',
  mid: () => 'src/middleware.ts',
  rt: () => 'src/routes.ts',
  tst: (p) => 'tests/' + p.e + '.test.ts',
};

const CATEGORIES = [
  { id: 'bug_diagnosis', prefix: 'BUG', items: [
    ['Why does creating a {e} fail with a name is required error even when I send a name?', 'val:validate{E}Input', 'svc:{E}Service.create'],
    ['Why does {e} lookup by id return the wrong record or throw not found?', 'db:find{E}ById', 'err:NotFoundError'],
    ['Why does the {e} API answer 401 for requests that include a key?', 'mid:requireAuth', 'cfg:loadConfig'],
    ['Why does renaming a {e} to a valid name get rejected by validation?', 'svc:{E}Service.rename', 'val:validate{E}Input'],
    ['Why does a deleted {e} still appear when I fetch it again?', 'svc:{E}Service.remove', 'svc:{E}Service.get'],
    ['Why can fetching a {e} produce an undefined value error?', 'svc:{E}Service.get', 'db:find{E}ById'],
    ['Why does create{E}Handler save a {e} through the wrong function?', 'rt:create{E}Handler', 'svc:{E}Service.create'],
    ['Why does countByOwner return the wrong number of {es}?', 'svc:{E}Service.countByOwner', 'db:list{E}s'],
    ['Why is the configured timeout ignored when the app starts?', 'cfg:loadConfig', 'cfg:DEFAULT_TIMEOUT_MS'],
    ['Why does every failed {e} removal come back as a 500 error?', 'svc:{E}Service.remove', 'mid:handleError'],
  ] },
  { id: 'code_navigation', prefix: 'NAV', items: [
    ['Where is insert{E} defined?', 'db:insert{E}'],
    ['Where is the {E}Service class defined?', 'svc:{E}Service'],
    ['Where is the route that deletes a {e} defined?', 'rt:delete{E}Handler', 'rt:routes'],
    ['Where is the application configuration defined?', 'cfg:AppConfig', 'cfg:loadConfig'],
    ['Where does input validation for a {e} happen?', 'val:validate{E}Input'],
    ['Where does database access for {es} happen?', 'db:find{E}ById', 'db:insert{E}', 'db:list{E}s'],
    ['Where is a NotFoundError generated?', 'db:find{E}ById', 'err:NotFoundError'],
    ['Where is sanitizeName used?', 'val:sanitizeName', 'svc:{E}Service.create', 'svc:{E}Service.rename'],
    ['Where does the feature of renaming a {e} start?', 'rt:rename{E}Handler', 'svc:{E}Service.rename'],
    ['Where is the error response for failed requests implemented?', 'mid:handleError'],
  ] },
  { id: 'function_understanding', prefix: 'FUN', items: [
    ['What does validate{E}Input do?', 'val:validate{E}Input'],
    ['What inputs does {E}Service.create accept?', 'svc:{E}Service.create', 'mod:{E}'],
    ['What does find{E}ById return?', 'db:find{E}ById', 'mod:{E}'],
    ['What functions does {E}Service.rename call?', 'svc:{E}Service.rename', 'val:validate{E}Input', 'val:sanitizeName', 'db:update{E}'],
    ['What dependencies does {E}Service.get use?', 'svc:{E}Service.get', 'cfg:loadConfig', 'db:find{E}ById'],
    ['What conditions does requireAuth check?', 'mid:requireAuth', 'cfg:loadConfig'],
    ['What errors can delete{E} produce?', 'db:delete{E}', 'err:NotFoundError'],
    ['What side effects does {E}Service.remove have?', 'svc:{E}Service.remove', 'db:delete{E}'],
    ['What happens when update{E} fails?', 'db:update{E}', 'db:find{E}ById'],
    ['Which code path does create{E}Handler follow?', 'rt:create{E}Handler', 'mid:requireAuth', 'svc:{E}Service.create', 'mid:handleError'],
  ] },
  { id: 'class_understanding', prefix: 'CLS', items: [
    ['What is {E}Service responsible for?', 'svc:{E}Service'],
    ['Where is {E}Service instantiated?', 'f:src/routes.ts', 'tst:testCreate{E}'],
    ['Which methods does {E}Service expose?', 'svc:{E}Service.create', 'svc:{E}Service.get', 'svc:{E}Service.rename', 'svc:{E}Service.remove', 'svc:{E}Service.countByOwner'],
    ['Which methods call validate{E}Input?', 'svc:{E}Service.create', 'svc:{E}Service.rename', 'val:validate{E}Input'],
    ['What data does the {e} model store?', 'mod:{E}'],
    ['Which classes depend on AppError?', 'err:AppError', 'err:ValidationError', 'err:NotFoundError', 'svc:{E}Service.remove'],
    ['How are {e} objects created?', 'svc:{E}Service.create', 'db:insert{E}', 'mod:{E}'],
    ['How does the state of a cached {e} change?', 'svc:{E}Service.get', 'svc:{E}Service.rename', 'svc:{E}Service.remove'],
    ['Which methods modify {e} state?', 'svc:{E}Service.create', 'svc:{E}Service.rename', 'svc:{E}Service.remove'],
    ['What would be affected by changing the {E}Service class?', 'svc:{E}Service', 'rt:create{E}Handler', 'rt:get{E}Handler', 'rt:rename{E}Handler', 'rt:delete{E}Handler'],
  ] },
  { id: 'dependency_tracing', prefix: 'DEP', items: [
    ['What calls insert{E}?', 'db:insert{E}', 'svc:{E}Service.create'],
    ['What does {E}Service.create call?', 'svc:{E}Service.create', 'val:validate{E}Input', 'val:sanitizeName', 'db:insert{E}'],
    ['What imports the validators module?', 'f:src/service.ts', 'f:src/validators.ts'],
    ['What does the db module import?', 'f:src/db.ts', 'f:src/config.ts', 'f:src/errors.ts', 'f:src/model.ts'],
    ['What are the direct callers of loadConfig?', 'cfg:loadConfig', 'db:connectDb', 'svc:{E}Service.get', 'mid:requireAuth'],
    ['What are the direct dependencies of requireAuth?', 'mid:requireAuth', 'err:AppError', 'cfg:loadConfig'],
    ['Show the call chain from create{E}Handler to the database.', 'rt:create{E}Handler', 'svc:{E}Service.create', 'db:insert{E}'],
    ['How is find{E}ById related to update{E} and delete{E}?', 'db:find{E}ById', 'db:update{E}', 'db:delete{E}'],
    ['What are the upstream dependencies of handleError?', 'mid:handleError', 'rt:create{E}Handler', 'rt:get{E}Handler', 'rt:rename{E}Handler', 'rt:delete{E}Handler'],
    ['What are the downstream dependencies of {E}Service.get?', 'svc:{E}Service.get', 'cfg:loadConfig', 'db:find{E}ById'],
  ] },
  { id: 'error_path', prefix: 'ERR', items: [
    ['Where does a NotFoundError originate for a {e}?', 'db:find{E}ById', 'err:NotFoundError'],
    ['Where is a validation exception thrown?', 'val:validate{E}Input', 'err:ValidationError'],
    ['Where is the error from delete{E} caught?', 'svc:{E}Service.remove', 'db:delete{E}'],
    ['What happens after validate{E}Input throws?', 'rt:create{E}Handler', 'mid:handleError', 'val:validate{E}Input'],
    ['Which functions can produce an error when saving a {e}?', 'val:validate{E}Input', 'svc:{E}Service.create'],
    ['Which route can return a 404 error?', 'rt:get{E}Handler', 'db:find{E}ById', 'mid:handleError'],
    ['How does an error propagate from the database to the HTTP response?', 'db:find{E}ById', 'svc:{E}Service.get', 'rt:get{E}Handler', 'mid:handleError'],
    ['Where is the error handling middleware?', 'mid:handleError'],
    ['What is the fallback behavior for unknown errors?', 'mid:handleError'],
    ['What is the failure path when the API key is wrong?', 'mid:requireAuth', 'err:AppError', 'mid:handleError'],
  ] },
  { id: 'data_flow', prefix: 'FLW', items: [
    ['Where does {e} input enter the system?', 'rt:create{E}Handler'],
    ['Where is the {e} name transformed before saving?', 'val:sanitizeName', 'svc:{E}Service.create'],
    ['Where is the {e} input validated?', 'val:validate{E}Input'],
    ['Where is {e} data passed from the service to the database?', 'svc:{E}Service.create', 'db:insert{E}'],
    ['Where is {e} data stored?', 'db:insert{E}'],
    ['Where is {e} data retrieved from storage?', 'db:find{E}ById', 'db:list{E}s'],
    ['How does data move from the route handler to storage when creating a {e}?', 'rt:create{E}Handler', 'svc:{E}Service.create', 'db:insert{E}'],
    ['Where is the output response generated for a {e}?', 'rt:get{E}Handler', 'mid:handleError'],
    ['Which function transforms the name value?', 'val:sanitizeName'],
    ['Which component consumes the owner id?', 'svc:{E}Service.countByOwner', 'val:validate{E}Input'],
  ] },
  { id: 'impact_analysis', prefix: 'IMP', items: [
    ['What depends on find{E}ById?', 'db:find{E}ById', 'db:update{E}', 'svc:{E}Service.get'],
    ['What could break if I change validate{E}Input?', 'val:validate{E}Input', 'svc:{E}Service.create', 'svc:{E}Service.rename'],
    ['Which callers need modification if sanitizeName changes its signature?', 'val:sanitizeName', 'svc:{E}Service.create', 'svc:{E}Service.rename'],
    ['Which imports are affected if I rename the {e} model?', 'mod:{E}', 'f:src/db.ts', 'f:src/service.ts'],
    ['Which tests may be affected if create{E}Handler changes?', 'rt:create{E}Handler', 'tst:testCreateHandlerRejectsMissingKey'],
    ['Which routes depend on {E}Service?', 'svc:{E}Service', 'rt:create{E}Handler', 'rt:get{E}Handler', 'rt:rename{E}Handler', 'rt:delete{E}Handler'],
    ['Which files are affected if loadConfig changes?', 'cfg:loadConfig', 'f:src/db.ts', 'f:src/service.ts', 'f:src/middleware.ts'],
    ['Which symbols reference the AppError class?', 'err:AppError', 'err:ValidationError', 'err:NotFoundError', 'svc:{E}Service.remove'],
    ['What is the impact of renaming delete{E}?', 'db:delete{E}', 'svc:{E}Service.remove'],
    ['What is the impact of changing the return value of find{E}ById?', 'db:find{E}ById', 'db:update{E}', 'svc:{E}Service.get'],
  ] },
  { id: 'test_relationship', prefix: 'TST', items: [
    ['Which tests cover {E}Service.create?', 'tst:testCreate{E}', 'svc:{E}Service.create'],
    ['Which tests cover the create{E}Handler route?', 'tst:testCreateHandlerRejectsMissingKey', 'rt:create{E}Handler'],
    ['Where is the test for rename validation defined?', 'tst:testRenameValidation'],
    ['Which production code does testCreate{E} call?', 'tst:testCreate{E}', 'svc:{E}Service'],
    ['Which function is being tested by testRenameValidation?', 'tst:testRenameValidation', 'svc:{E}Service.rename'],
    ['Which error case is tested for missing API keys?', 'tst:testCreateHandlerRejectsMissingKey', 'mid:requireAuth'],
    ['Which behavior of {E}Service has tests?', 'tst:testCreate{E}', 'tst:testRenameValidation'],
    ['Does {E}Service.remove have direct tests?', 'svc:{E}Service.remove', 'f:tests/{e}.test.ts'],
    ['What code does makeResponse in the tests depend on?', 'tst:makeResponse', 'tst:testCreateHandlerRejectsMissingKey'],
    ['Which tests may need updating after changing validate{E}Input?', 'val:validate{E}Input', 'tst:testRenameValidation', 'tst:testCreate{E}'],
  ] },
  { id: 'configuration', prefix: 'CFG', items: [
    ['Where is configuration defined?', 'cfg:AppConfig', 'cfg:loadConfig'],
    ['Where is the API_KEY environment variable used?', 'cfg:loadConfig', 'mid:requireAuth'],
    ['Where is the timeout configured?', 'cfg:DEFAULT_TIMEOUT_MS', 'cfg:loadConfig'],
    ['Where are authentication settings configured?', 'cfg:loadConfig', 'mid:requireAuth'],
    ['Where are database settings configured?', 'cfg:loadConfig', 'db:connectDb'],
    ['Where is the API configuration defined?', 'cfg:AppConfig', 'cfg:loadConfig'],
    ['Where is the cache feature flag used?', 'cfg:loadConfig', 'svc:{E}Service.get'],
    ['Where are default values defined?', 'cfg:DEFAULT_TIMEOUT_MS', 'cfg:MAX_NAME_LENGTH', 'cfg:loadConfig'],
    ['Where is configuration passed to other code?', 'cfg:loadConfig', 'db:connectDb', 'mid:requireAuth', 'svc:{E}Service.get'],
    ['What code depends on the maximum name length setting?', 'cfg:MAX_NAME_LENGTH', 'val:validate{E}Input'],
  ] },
  { id: 'api_route', prefix: 'API', items: [
    ['Where is the endpoint for creating a {e} defined?', 'rt:routes', 'rt:create{E}Handler'],
    ['What handler serves the get {e} route?', 'rt:get{E}Handler', 'rt:routes'],
    ['What middleware runs before create{E}Handler?', 'mid:requireAuth', 'rt:create{E}Handler'],
    ['What service does the rename {e} route call?', 'rt:rename{E}Handler', 'svc:{E}Service.rename'],
    ['What validation does the create {e} route perform?', 'rt:create{E}Handler', 'val:validate{E}Input'],
    ['What parameters does the get {e} route accept?', 'rt:get{E}Handler'],
    ['What response does the create {e} route produce?', 'rt:create{E}Handler'],
    ['What errors can the delete {e} route return?', 'rt:delete{E}Handler', 'mid:handleError', 'db:delete{E}'],
    ['Which routes use the requireAuth middleware?', 'mid:requireAuth', 'rt:create{E}Handler', 'rt:get{E}Handler', 'rt:rename{E}Handler', 'rt:delete{E}Handler'],
    ['How does a request reach the service when deleting a {e}?', 'rt:delete{E}Handler', 'svc:{E}Service.remove'],
  ] },
  { id: 'database_access', prefix: 'DBA', items: [
    ['Where is the database connection created?', 'db:connectDb'],
    ['Where are queries executed for {es}?', 'db:find{E}ById', 'db:list{E}s'],
    ['Where are {es} inserted?', 'db:insert{E}'],
    ['Where are {es} updated?', 'db:update{E}'],
    ['Where are {es} deleted?', 'db:delete{E}'],
    ['Which service accesses the database?', 'svc:{E}Service', 'db:insert{E}'],
    ['Which function retrieves a {e} from the database?', 'db:find{E}ById'],
    ['Where are database errors handled?', 'svc:{E}Service.remove', 'mid:handleError'],
    ['Which models are used by the data layer?', 'mod:{E}', 'f:src/db.ts'],
    ['Which routes depend on database access?', 'rt:create{E}Handler', 'rt:get{E}Handler', 'rt:rename{E}Handler', 'rt:delete{E}Handler', 'db:insert{E}'],
  ] },
  { id: 'security_validation', prefix: 'SEC', items: [
    ['Where is authentication checked?', 'mid:requireAuth'],
    ['Where is authorization checked?', 'mid:requireAuth'],
    ['Where is user input validated?', 'val:validate{E}Input'],
    ['Where are tokens or API keys verified?', 'mid:requireAuth', 'cfg:loadConfig'],
    ['Where are passwords or secrets handled?', 'cfg:loadConfig'],
    ['Where are permissions checked?', 'mid:requireAuth'],
    ['Where is unsafe input rejected?', 'val:validate{E}Input', 'err:ValidationError'],
    ['Which middleware protects the delete {e} route?', 'mid:requireAuth', 'rt:delete{E}Handler'],
    ['Where is security-related configuration used?', 'cfg:loadConfig', 'mid:requireAuth'],
    ['Which functions handle sensitive input?', 'val:sanitizeName', 'val:validate{E}Input', 'mid:requireAuth'],
  ] },
  { id: 'performance', prefix: 'PRF', items: [
    ['Which function performs expensive work over all {es}?', 'svc:{E}Service.countByOwner', 'db:list{E}s'],
    ['Where do repeated operations occur?', 'svc:{E}Service.countByOwner'],
    ['Which function performs database access on every call?', 'db:insert{E}', 'db:connectDb'],
    ['Where do loops process collections of {es}?', 'svc:{E}Service.countByOwner', 'db:list{E}s'],
    ['Where may unnecessary calls to loadConfig occur?', 'svc:{E}Service.get', 'mid:requireAuth', 'db:connectDb', 'cfg:loadConfig'],
    ['Which functions call list{E}s?', 'svc:{E}Service.countByOwner', 'db:list{E}s'],
    ['Where is caching implemented?', 'svc:{E}Service.get', 'svc:{E}Service.rename', 'svc:{E}Service.remove'],
    ['Where are timeouts configured?', 'cfg:DEFAULT_TIMEOUT_MS', 'cfg:loadConfig'],
    ['Where does repeated computation of the {e} name happen?', 'val:sanitizeName', 'svc:{E}Service.create', 'svc:{E}Service.rename'],
    ['Which component is likely involved in a slow path when counting {es}?', 'svc:{E}Service.countByOwner', 'db:list{E}s'],
  ] },
  { id: 'feature_change', prefix: 'FTR', items: [
    ['Where should I add a new validation rule for a {e}?', 'val:validate{E}Input'],
    ['Where should I add a new route for listing {es}?', 'rt:routes', 'rt:get{E}Handler'],
    ['Where should I modify authentication?', 'mid:requireAuth'],
    ['Where should I add a new service operation for a {e}?', 'svc:{E}Service'],
    ['Where should I modify database behavior for saving {es}?', 'db:insert{E}'],
    ['Where should I add a new configuration option?', 'cfg:AppConfig', 'cfg:loadConfig'],
    ['Where should I update error handling?', 'mid:handleError', 'err:AppError'],
    ['Where should I modify response formatting?', 'rt:create{E}Handler', 'mid:handleError'],
    ['Which files need changing to add a new field to a {e}?', 'mod:{E}', 'val:validate{E}Input', 'svc:{E}Service.create'],
    ['Which existing components should be reused to add a new {e} operation?', 'svc:{E}Service', 'db:update{E}', 'val:validate{E}Input', 'mid:requireAuth'],
  ] },
];

// ---------- helpers ----------
function fill(text, p) {
  return text.replace(/\{E\}/g, p.E).replace(/\{e\}/g, p.e).replace(/\{es\}/g, p.e + 's');
}

function expandExpected(item, p) {
  const colon = item.indexOf(':');
  const prefix = item.slice(0, colon);
  const rest = fill(item.slice(colon + 1), p);
  return prefix === 'f' ? rest : FILES[prefix](p) + ':' + rest;
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

// ---------- generate ----------
const projectFiles = {};
for (const p of PROJECTS) {
  projectFiles[p.name] = fixtureFiles(p);
  for (const rel of Object.keys(projectFiles[p.name])) {
    writeFile(path.join(ROOT, 'projects', p.name, rel), projectFiles[p.name][rel]);
  }
}

const cases = [];
const problems = [];
for (const category of CATEGORIES) {
  if (category.items.length !== 10) problems.push(category.id + ' does not have 10 items');
  category.items.forEach((item, i) => {
    const p = PROJECTS[i];
    const id = category.prefix + '-' + String(i + 1).padStart(3, '0');
    const expected = item.slice(1).map((x) => expandExpected(x, p));
    const question = fill(item[0], p);

    for (const exp of expected) {
      const colon = exp.indexOf(':');
      const file = colon === -1 ? exp : exp.slice(0, colon);
      const content = projectFiles[p.name][file];
      if (content === undefined) {
        problems.push(id + ': file not in fixture: ' + file);
      } else if (colon !== -1) {
        const name = exp.slice(colon + 1).split('.').pop();
        if (!new RegExp('\\b' + name + '\\b').test(content)) problems.push(id + ': symbol not found: ' + exp);
      }
    }
    cases.push({ id, category: category.id, repository: p.name, question, expected });
  });
}

const ids = new Set(cases.map((c) => c.id));
if (cases.length !== 150 || ids.size !== 150) problems.push('expected 150 unique cases, got ' + cases.length + ' / ' + ids.size);
if (problems.length > 0) {
  console.error('Generator problems:\n' + problems.join('\n'));
  process.exit(1);
}

const repositories = PROJECTS.map((p) => ({ name: p.name, path: 'projects/' + p.name }));
const json =
  '{\n  "repositories": ' + JSON.stringify(repositories) + ',\n  "cases": [\n' +
  cases.map((c) => '    ' + JSON.stringify(c)).join(',\n') + '\n  ]\n}\n';
writeFile(path.join(ROOT, 'cases.json'), json);

console.log('Generated ' + PROJECTS.length + ' projects and ' + cases.length + ' cases (' + ids.size + ' unique IDs).');
console.log('Wrote benchmarks/cases.json');