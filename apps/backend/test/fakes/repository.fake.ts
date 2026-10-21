type Row = Record<string, any>;

export interface FakeRepositoryOptions {
  idKey?: string;
}

/**
 * Small in-memory TypeORM repository used by service-level integration tests.
 * It implements only the methods exercised by the tested services.
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
      if (expected && typeof expected === 'object') {
        if (
          expected.type === 'isNull' ||
          expected._type === 'isNull' ||
          expected.operator === 'isNull'
        ) {
          return row[key] == null;
        }
        if (
          expected.type === 'in' ||
          expected._type === 'in' ||
          expected.operator === 'in'
        ) {
          return expected.value
            .map((value: any) => String(value))
            .includes(String(row[key]));
        }
      }
      return String(row[key]) === String(expected);
    });

  const findOne = jest.fn(async (args?: any) => {
    const where = args?.where;
    return rows.find((row) => !where || matchesWhere(row, where)) ?? null;
  });

  const find = jest.fn(async (args?: any) => {
    const where = args?.where;
    return where
      ? rows.filter((row) => matchesWhere(row, where))
      : [...rows];
  });

  const create = jest.fn((input: Partial<T>) => ({ ...input }) as T);

  const save = jest.fn(async (entity: T) => {
    const id = entity[idKey];
    if (id == null) {
      rows.push(entity);
      return entity;
    }
    const index = rows.findIndex(
      (row) => String(row[idKey]) === String(id),
    );
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

  const deleteFn = jest.fn(async (idOrCriteria: any) => {
    const id =
      idOrCriteria && typeof idOrCriteria === 'object'
        ? idOrCriteria[idKey]
        : idOrCriteria;
    const index = rows.findIndex(
      (row) => String(row[idKey]) === String(id),
    );
    if (index >= 0) rows.splice(index, 1);
    return { affected: index >= 0 ? 1 : 0 };
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
    remove,
    delete: deleteFn,
    createQueryBuilder,
  };
}
