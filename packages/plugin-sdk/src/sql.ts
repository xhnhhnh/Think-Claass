/**
 * Tiny SQL fragment helpers for cleanup rules.
 *
 * A cleanup rule deletes the rows an account owns, and "the rows an account owns" is almost always
 * `column IN (id, id, ...)` for one of the named id sets in `CleanupSubject`. Without a helper every
 * plugin would open-code the same string join and the same empty-list branch - and the empty-list
 * branch is not cosmetic: `IN ()` is a syntax error, and "no ids" must never widen into "every row".
 * `inList` returns `null` for an empty set precisely so the caller has to decide, and `orAll`
 * composes the non-null branches.
 *
 * Deliberately *not* a query builder: it produces one predicate per call and knows nothing about
 * tables, statements or schemas. Column names are validated because they are interpolated.
 */

import type { SqlParam } from './context.js';

export interface SqlFragment {
  /** A predicate such as `student_id IN (?, ?)`. */
  sql: string;
  params: SqlParam[];
}

/**
 * `column IN (?, ?, ...)`, or `null` when there are no ids.
 *
 * `null` means "this branch matches nothing" - the caller must skip it rather than emit an empty
 * `IN ()`. Returning a fragment for an empty list would be a silent full-table delete waiting for
 * the one caller who forgets to check.
 */
export function inList(column: string, ids: number[]): SqlFragment | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) {
    throw new Error(`inList(): unsafe column name ${JSON.stringify(column)}`);
  }
  const values = Array.isArray(ids) ? ids.filter((id) => typeof id === 'number' && Number.isFinite(id)) : [];
  if (values.length === 0) return null;
  return {
    sql: `${column} IN (${values.map(() => '?').join(', ')})`,
    params: values,
  };
}

/** `a = ?` for a single scalar (an id that is not a set). */
export function equals(column: string, value: SqlParam): SqlFragment {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) {
    throw new Error(`equals(): unsafe column name ${JSON.stringify(column)}`);
  }
  return { sql: `${column} = ?`, params: [value] };
}

/**
 * Combine fragments with `OR`, dropping the `null` ones.
 *
 * Returns `null` when every branch is empty, which is the signal a rule must use to skip the whole
 * statement: an account with no classes and no students owns no rows in the class-owned tables.
 */
export function orAll(fragments: Array<SqlFragment | null>): SqlFragment | null {
  const present = fragments.filter((fragment): fragment is SqlFragment => fragment !== null);
  if (present.length === 0) return null;
  return {
    sql: present.map((fragment) => fragment.sql).join(' OR '),
    params: present.flatMap((fragment) => fragment.params),
  };
}

/** Combine fragments with `AND`, dropping the `null` ones; `null` when every branch is empty. */
export function andAll(fragments: Array<SqlFragment | null>): SqlFragment | null {
  const present = fragments.filter((fragment): fragment is SqlFragment => fragment !== null);
  if (present.length === 0) return null;
  return {
    sql: present.map((fragment) => fragment.sql).join(' AND '),
    params: present.flatMap((fragment) => fragment.params),
  };
}

/** Wrap a predicate in parentheses, so `OR`/`AND` composition cannot change its meaning. */
export function grouped(fragment: SqlFragment): SqlFragment {
  return { sql: `(${fragment.sql})`, params: fragment.params };
}
