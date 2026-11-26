import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..');

const readController = () =>
  readFileSync(
    join(
      backendRoot,
      'src/modules/subjects/subject-edit-requests.controller.ts',
    ),
    'utf8',
  );

const ROLES =
  "@Roles('administrator', 'college_dean', 'college_secretary', 'department_head')";

const ROUTES = [
  {
    decorator: "@Get('edit-requests')",
    method: 'findVisible',
    audited: false,
  },
  {
    decorator: "@Get(':subjectId/edit-request')",
    method: 'findCurrentForSubject',
    audited: false,
  },
  {
    decorator: "@Post(':subjectId/edit-request')",
    method: 'create',
    audited: true,
  },
  {
    decorator: "@Patch('edit-requests/:requestId')",
    method: 'respond',
    audited: true,
  },
  {
    decorator: "@Delete('edit-requests/:requestId')",
    method: 'cancel',
    audited: true,
  },
] as const;

function methodSource(source: string, methodName: string): string {
  const marker = `async ${methodName}(`;
  const methodIndex = source.indexOf(marker);
  assert.notEqual(methodIndex, -1, `controller is missing ${marker.trim()}`);

  let start = source.lastIndexOf('\n', methodIndex - 1) + 1;
  while (start > 0) {
    const previousLineEnd = start - 1;
    const previousLineStart =
      source.lastIndexOf('\n', previousLineEnd - 1) + 1;
    const previousLine = source.slice(previousLineStart, previousLineEnd);
    if (!/^\s*@/.test(previousLine)) break;
    start = previousLineStart;
  }
  assert.ok(
    source.slice(start, methodIndex).includes('@'),
    `${methodName} is missing route decorators`,
  );

  const nextDecorator = source.indexOf('\n  @', methodIndex);
  const end = nextDecorator === -1 ? source.length : nextDecorator;
  return source.slice(start, end);
}

describe('subject edit-request route contract', () => {
  it('declares a guarded v1/subjects controller', () => {
    const source = readController();

    assert.match(source, /@Controller\('v1\/subjects'\)/);
    assert.match(source, /@UseGuards\(JwtAuthGuard, RolesGuard\)/);
    assert.match(source, /from '\.\.\/\.\.\/common\/guards\/jwt-auth\.guard'/);
    assert.match(source, /from '\.\.\/\.\.\/common\/guards\/roles\.guard'/);
  });

  it('exposes the five routes with role metadata and data envelopes', () => {
    const source = readController();

    for (const route of ROUTES) {
      const block = methodSource(source, route.method);

      assert.ok(
        block.includes(route.decorator),
        `${route.method} must declare ${route.decorator}`,
      );
      assert.ok(
        block.includes(ROLES),
        `${route.method} must require all four roles`,
      );
      assert.match(
        block,
        /return\s*\{\s*data:/,
        `${route.method} must return a { data } envelope`,
      );
    }
  });

  it('audits only create, respond, and cancel', () => {
    const source = readController();

    for (const route of ROUTES) {
      const block = methodSource(source, route.method);
      assert.equal(
        block.includes('@Auditable('),
        route.audited,
        `${route.method} auditable flag does not match the route contract`,
      );
    }
  });

  it('passes parsed status and subjectId query values to findVisible', () => {
    const source = readController();

    assert.match(
      source,
      /findVisible\(\s*\{\s*status:\s*parse\w+\(status\),\s*subjectId:\s*parse\w+\(subjectId\)\s*\}/,
      'findVisible must receive parsed status and subjectId values',
    );
  });

  it('registers the controller before SubjectsController', () => {
    const moduleSource = readFileSync(
      join(backendRoot, 'src/modules/subjects/subjects.module.ts'),
      'utf8',
    );
    const controllers = moduleSource.match(/controllers:\s*\[([\s\S]*?)\]/)?.[1];

    assert.equal(
      controllers?.replace(/\s/g, ''),
      'SubjectEditRequestsController,SubjectsController',
      'the static edit-request routes must be registered before :id routes',
    );
  });
});
