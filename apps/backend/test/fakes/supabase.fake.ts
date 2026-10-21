type Row = Record<string, any>;

export interface FakeSupabaseCall {
  table: string;
  operation: 'select';
  filters: Array<{ column: string; operator: string; value: any }>;
  order?: { column: string; ascending: boolean };
  limit?: number;
}

export interface FakeSupabaseOptions {
  tables?: Record<string, Row[]>;
  authUser?: Row;
  authError?: Error | null;
  signInResult?: {
    data: { session: any; user: any };
    error: Error | null;
  };
}

/**
 * Minimal in-memory stand-in for SupabaseService.
 *
 * It supports the read-only query chain used by search-style services:
 * select, eq, ilike, or, order, and limit. Write operations are added when
 * the integration-test suite starts covering write endpoints.
 *
 * `or()` is recorded but not evaluated. Tests provide only rows that should
 * be returned, which keeps the fake deterministic without reimplementing
 * PostgREST's filter parser.
 */
export function createFakeSupabase(options: FakeSupabaseOptions = {}) {
  const tables = new Map<string, Row[]>();
  for (const [name, rows] of Object.entries(options.tables ?? {})) {
    tables.set(
      name,
      rows.map((row) => ({ ...row })),
    );
  }

  const calls: FakeSupabaseCall[] = [];
  const authUser = options.authUser ?? {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'test@wmsu.edu.ph',
  };

  const client = {
    from(table: string) {
      return new FakeSelectQuery(table, tables, calls);
    },
    auth: {
      async getUser(token: string) {
        if (options.authError) {
          return { data: { user: null }, error: options.authError };
        }
        if (token === 'invalid-token') {
          return {
            data: { user: null },
            error: new Error('Invalid or expired token'),
          };
        }
        return { data: { user: authUser }, error: null };
      },
      async signInWithPassword(_credentials: {
        email: string;
        password: string;
      }) {
        if (options.signInResult) return options.signInResult;
        return {
          data: {
            session: {
              access_token: 'fake-access-token',
              refresh_token: 'fake-refresh-token',
            },
            user: authUser,
          },
          error: null,
        };
      },
    },
  };

  return {
    getClient: () => client,
    getAdminClient: () => client,
    tables,
    calls,
  };
}

class FakeSelectQuery implements PromiseLike<{
  data: Row[];
  error: null;
}> {
  private filters: FakeSupabaseCall['filters'] = [];
  private orderBy?: { column: string; ascending: boolean };
  private limitCount?: number;

  constructor(
    private readonly table: string,
    private readonly tables: Map<string, Row[]>,
    private readonly calls: FakeSupabaseCall[],
  ) {}

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ column, operator: 'neq', value });
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push({ column, operator: 'in', value: values });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({ column, operator: 'is', value });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ column, operator: 'ilike', value });
    return this;
  }

  or(_expression: string) {
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private rows(): Row[] {
    let rows = [...(this.tables.get(this.table) ?? [])];

    for (const filter of this.filters) {
      if (filter.operator === 'eq') {
        rows = rows.filter(
          (row) => String(row[filter.column]) === String(filter.value),
        );
      } else if (filter.operator === 'neq') {
        rows = rows.filter(
          (row) => String(row[filter.column]) !== String(filter.value),
        );
      } else if (filter.operator === 'in') {
        const values = filter.value.map((value: any) => String(value));
        rows = rows.filter((row) =>
          values.includes(String(row[filter.column])),
        );
      } else if (filter.operator === 'is') {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      } else if (filter.operator === 'ilike') {
        const needle = String(filter.value).replace(/%/g, '').toLowerCase();
        rows = rows.filter((row) =>
          String(row[filter.column] ?? '')
            .toLowerCase()
            .includes(needle),
        );
      }
    }

    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows.sort((a, b) => {
        const left = String(a[column] ?? '');
        const right = String(b[column] ?? '');
        return (
          left.localeCompare(right, undefined, { numeric: true }) *
          (ascending ? 1 : -1)
        );
      });
    }

    if (this.limitCount != null) {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.calls.push({
      table: this.table,
      operation: 'select',
      filters: [...this.filters],
      order: this.orderBy,
      limit: this.limitCount,
    });

    return Promise.resolve({ data: this.rows(), error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}
