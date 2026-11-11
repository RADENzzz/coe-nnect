type Row = Record<string, any>;

export interface FakeRepositoryOptions {
  idKey?: string;
}

/**
 * Small in-memory TypeORM repository used by service-level integration tests.
 * It implements only the methods exercised by the tested services.
 *
 * Supported find operators: `isNull`, `in`, `lessThan`, `lessThanOrEqual`,
 * `moreThan`, `moreThanOrEqual`. `find` also honours `order` and `take`.
 * `delete(criteria)` removes every matching row; `delete(id)` removes one.
 */
export function createFakeRepository<T extends Row = Row>(
  initialRows: T[] = [],
  options: FakeRepositoryOptions = {},
) {
  const idKey = options.idKey ?? 'id';
  const rows: T[] = initialRows.map((row) => ({ ...row }));

  const matchesWhere = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, expected]) => {
      if (expected === undefined) return true;
      if (expected && typeof expected === 'object' && 'type' in expected) {
        const value = (expected as any).value;
        switch ((expected as any).type) {
          case 'isNull':
            return row[key] == null;
          case 'in':
            return (value as any[])
              .map((item) => String(item))
              .includes(String(row[key]));
          case 'lessThan':
            return compareValues(row[key], value) < 0;
          case 'lessThanOrEqual':
            return compareValues(row[key], value) <= 0;
          case 'moreThan':
            return compareValues(row[key], value) > 0;
          case 'moreThanOrEqual':
            return compareValues(row[key], value) >= 0;
          default:
            break;
        }
      }
      return String(row[key]) === String(expected);
    });

  const sortRows = (result: T[], order?: Record<string, 'ASC' | 'DESC'>) => {
    if (!order) return result;
    const entries = Object.entries(order);
    return [...result].sort((a, b) => {
      for (const [key, direction] of entries) {
        const delta = compareValues(a[key], b[key]);
        if (delta !== 0) return direction === 'DESC' ? -delta : delta;
      }
      return 0;
    });
  };

  const findOne = jest.fn(async (args?: any) => {
    const where = args?.where;
    const matched = rows.filter((row) => !where || matchesWhere(row, where));
    const sorted = sortRows(matched, args?.order);
    return sorted[0] ?? null;
  });

  const find = jest.fn(async (args?: any) => {
    const where = args?.where;
    const matched = where
      ? rows.filter((row) => matchesWhere(row, where))
      : [...rows];
    const sorted = sortRows(matched, args?.order);
    return args?.take ? sorted.slice(0, args.take) : sorted;
  });

  const create = jest.fn((input: Partial<T>) => ({ ...input }) as T);

  const save = jest.fn(async (entity: T) => {
    const id = entity[idKey];
    if (id == null) {
      rows.push(entity);
      return entity;
    }
    const index = rows.findIndex((row) => String(row[idKey]) === String(id));
    if (index >= 0) {
      rows[index] = entity;
    } else {
      rows.push(entity);
    }
    return entity;
  });

  const remove = jest.fn(async (entity: T) => {
    const index = rows.indexOf(entity);
    if (index >= 0) rows.splice(index, 1);
    return entity;
  });

  const update = jest.fn(async (criteria: any, partial: Partial<T>) => {
    let affected = 0;
    for (const row of rows) {
      if (matchesWhere(row, criteria)) {
        Object.assign(row, partial);
        affected += 1;
      }
    }
    return { affected };
  });

  const deleteFn = jest.fn(async (idOrCriteria: any) => {
    const isIdLookup =
      !idOrCriteria ||
      typeof idOrCriteria !== 'object' ||
      Object.prototype.hasOwnProperty.call(idOrCriteria, idKey);

    if (isIdLookup) {
      const id = idOrCriteria?.[idKey] ?? idOrCriteria;
      const index = rows.findIndex((row) => String(row[idKey]) === String(id));
      if (index >= 0) rows.splice(index, 1);
      return { affected: index >= 0 ? 1 : 0 };
    }

    let affected = 0;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (matchesWhere(rows[index], idOrCriteria)) {
        rows.splice(index, 1);
        affected += 1;
      }
    }
    return { affected };
  });

  const createQueryBuilder = jest.fn(() => {
    const builder: any = {
      where: jest.fn(() => builder),
      orderBy: jest.fn(() => builder),
      getMany: jest.fn(async () => [...rows]),
    };
    return builder;
  });

  return {
    rows,
    find,
    findOne,
    create,
    save,
    update,
    remove,
    delete: deleteFn,
    createQueryBuilder,
  };
}

function compareValues(left: any, right: any): number {
  if (left instanceof Date || right instanceof Date) {
    const leftTime =
      left instanceof Date ? left.getTime() : new Date(left ?? 0).getTime();
    const rightTime =
      right instanceof Date ? right.getTime() : new Date(right ?? 0).getTime();
    return leftTime - rightTime;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left ?? '').localeCompare(String(right ?? ''));
}
