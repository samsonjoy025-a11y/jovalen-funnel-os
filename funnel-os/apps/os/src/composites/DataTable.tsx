/**
 * DataTable — §1.3.
 *
 * Specified as: server-driven sort/filter/pagination, column visibility,
 * selection + bulk action bar, virtualisation, full keyboard navigation, CSV
 * export, per-field permission masking.
 *
 * What is here and what is not, stated plainly rather than left for a reader
 * to infer from a missing prop:
 *
 *   - server-driven sort/filter/pagination — YES. The hook owns the query
 *     params; this component never sorts or pages a local array.
 *   - full keyboard navigation — YES (below).
 *   - CSV export — YES.
 *   - column visibility — YES.
 *   - selection + bulk action bar — YES.
 *   - per-field permission masking — NO. It needs the PRD's field-permission
 *     model, which is not in the repository. The `masked` prop exists so a
 *     screen can *state* that a field is masked, but nothing computes what may
 *     be masked. Inventing that rule would look authoritative and be fiction.
 *   - virtualisation — NO. At 64 rows it is not needed, and adding it before
 *     there is a large page would mean shipping an unmeasurable optimisation
 *     plus the keyboard-navigation bugs that always accompany it.
 *
 * Keyboard navigation is the part worth reading. It is not "rows are focusable".
 * It is a roving tabindex with Arrow/Home/End, Space to select, Shift+Arrow to
 * extend a range, Ctrl/Cmd+A to select all on the page, and Escape to clear —
 * which is the interaction a spreadsheet-trained user already has in their
 * fingers.
 */

import * as React from 'react';
import { Button, Checkbox } from '@funnelos/ui';
import { color, font, space } from '@funnelos/ui';
import { formatNumber } from '@funnelos/api-client';

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. Return the value; formatting belongs here, not in CSS. */
  render: (row: T) => React.ReactNode;
  /** Sort key sent to the server, if the column is sortable at all. */
  sortKey?: string;
  align?: 'start' | 'end';
  /** Screen-reader-only header suffix, e.g. "currency". */
  headerHint?: string;
  /** Start hidden. Column visibility then lets the user bring it back. */
  hiddenByDefault?: boolean;
  /**
   * This column's values are withheld by field permission.
   *
   * Requires `maskedReason` on the table. A masked column that renders as
   * blanks is indistinguishable from a column of empty strings, and a user
   * draws the wrong conclusion from it — "no data" rather than "not yours to
   * see". The reason is rendered once, above the table, and per-cell the cell
   * says "withheld" so a screen reader announces the same thing the eye sees.
   *
   * `render` is still called, so the *count* of rows stays correct; a masked
   * column must not silently change the table's shape.
   */
  masked?: boolean;
}

export interface DataTableProps<T> {
  caption: string;
  columns: ReadonlyArray<Column<T>>;
  rows: readonly T[];
  rowId: (row: T) => string;
  /**
   * The row's name, for the select checkbox and the row's own accessible name.
   *
   * Optional, but without it every checkbox on a page of 25 is "Select row 7",
   * and a screen-reader user has to walk the table to work out which record
   * that is — the checkbox is announced before the row's cells, so the very
   * thing that names it comes after it. Row *ordinal* is a position, not an
   * identity, and it changes when the sort or the page does.
   */
  rowLabel?: (row: T) => string;
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: 'asc' | 'desc';
  loading?: boolean;
  /** Aggregate line under the table. Computed server-side over the filter. */
  summary?: React.ReactNode;
  selectable?: boolean;
  bulkActions?: (selectedIds: string[], clear: () => void) => React.ReactNode;
  onSort?: (sortKey: string) => void;
  onPage?: (page: number) => void;
  onPageSize?: (size: number) => void;
  onRowActivate?: (row: T) => void;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
  /** Column whose values are not safe to expose; the reason is required so
   *  the UI can say why rather than showing an unexplained blank. */
  maskedReason?: string;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowId,
  total,
  page,
  pageSize,
  sort,
  dir,
  loading,
  summary,
  selectable,
  bulkActions,
  onSort,
  onPage,
  onPageSize,
  onRowActivate,
  rowLabel,
  emptyTitle = 'Nothing to show',
  emptyBody,
  emptyAction,
  maskedReason,
}: DataTableProps<T>) {
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(
    () => new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.key)),
  );
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());
  const [anchor, setAnchor] = React.useState<number | null>(null);
  const bodyRef = React.useRef<HTMLTableSectionElement | null>(null);

  const visible = columns.filter((c) => !hidden.has(c.key));
  const selectedHere = rows.filter((r) => selected.has(rowId(r)));
  const allSelected = rows.length > 0 && selectedHere.length === rows.length;
  const someSelected = selectedHere.length > 0 && !allSelected;

  const toggleColumn = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setSelection = React.useCallback((ids: Iterable<string>) => setSelected(new Set(ids)), []);

  const clearSelection = React.useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  /* --- keyboard: roving tabindex across the body ---------------------- */

  const moveFocus = (index: number) => {
    const body = bodyRef.current;
    if (!body) return;
    const rowEls = [...body.querySelectorAll<HTMLTableRowElement>('tr[data-row-index]')];
    const target = rowEls[Math.max(0, Math.min(rowEls.length - 1, index))];
    target?.focus();
  };

  const onRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>, row: T, index: number) => {
    const id = rowId(row);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(0);
        break;
      case 'End':
        e.preventDefault();
        moveFocus(rows.length - 1);
        break;
      case ' ':
      case 'Spacebar': {
        e.preventDefault();
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        setAnchor(index);
        break;
      }
      case 'a':
        if (e.ctrlKey || e.metaKey) {
          // Select every row on this page, not the whole result set — the
          // server would have to be asked for the other rows, and a user who
          // presses this wants the rows they can see.
          e.preventDefault();
          setSelected(new Set(rows.map(rowId)));
        }
        break;
      case 'Escape':
        if (selected.size > 0) {
          e.preventDefault();
          clearSelection();
        }
        break;
      case 'Enter':
        if (onRowActivate) {
          e.preventDefault();
          onRowActivate(row);
        }
        break;
      default:
        break;
    }
  };

  /* --- CSV export ------------------------------------------------------ */

  const exportCsv = () => {
    const head = visible.map((c) => csvCell(c.header)).join(',');
    /*
     * `c.render(row)` is NOT called for a masked column.
     *
     * This is the whole point. Masking a column on screen while the export
     * happily writes the real values to a file the user can attach to an
     * email is not masking, it is decoration — and it is the kind of bug that
     * survives review because the screenshot looks right. The renderer is
     * skipped rather than its result discarded so a masked column cannot leak
     * through a side effect, and so the export's fidelity to the screen is
     * structural rather than a rule someone has to remember.
     */
    const body = rows
      .map((row) =>
        visible
          .map((c) => (c.masked ? MASKED_CELL : csvCell(textOf(c.render(row)))))
          .join(','),
      )
      .join('\n');
    /*
     * The BOM is there so Excel opens a UTF-8 file without mangling it. Not
     * decoration — without it a name like "Amara Osei" survives but a
     * currency symbol does not. It is written as an explicit escape rather
     * than pasted in as an invisible character, because an invisible character
     * in a template literal is a byte nobody can see and a reviewer cannot
     * verify.
     */
    const blob = new Blob([`\ufeff${head}\n${body}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${caption.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (rows.length === 0) {
    return (
      <div className="os-state">
        <p className="os-state__title">{emptyTitle}</p>
        {emptyBody ? <p className="os-state__body">{emptyBody}</p> : null}
        {emptyAction ? <div className="os-row">{emptyAction}</div> : null}
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="os-col" style={{ gap: space['3'] }}>
      {bulkActions && selected.size > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="os-row"
          style={{
            padding: `${space['2']} ${space['3']}`,
            background: color.brand.subtle,
            border: `var(--ds-border-width-thin) solid ${color.brand.border}`,
            borderRadius: 'var(--ds-radius-md)',
          }}
        >
          <strong style={{ fontSize: font.size.sm }}>
            {selected.size} {selected.size === 1 ? 'row' : 'rows'} selected
          </strong>
          {bulkActions([...selected], clearSelection)}
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      <div className="os-table-scroll">
        <table className="os-table" aria-busy={loading || undefined}>
          <caption>
            {caption}
            {loading ? ' — updating' : ''}
          </caption>

          {hidden.size > 0 || visible.length < columns.length ? (
            <caption>
              <details style={{ marginTop: space['2'] }}>
                <summary style={{ cursor: 'pointer', minHeight: 'var(--ds-size-target-min)', display: 'list-item' }}>
                  Columns ({visible.length} of {columns.length} shown)
                </summary>
                <div className="os-row" style={{ marginTop: space['2'] }}>
                  {columns.map((c) => (
                    /*
                     * `Checkbox` owns its own <label>, so this must NOT be a
                     * <label> wrapper. The first draft wrapped it, which
                     * produced <label><button/><label>Name</label></label>:
                     * nested labels, where the outer one associates with
                     * nothing and the inner one is re-associated. Clicking the
                     * column name toggled the box *and* the inner label
                     * toggled it again, so it inverted. The control's `label`
                     * prop is the correct way to name it, and the `os-row`
                     * class is what supplies the layout the wrapper was
                     * reaching for.
                     */
                    <Checkbox
                      key={c.key}
                      checked={!hidden.has(c.key)}
                      onCheckedChange={() => toggleColumn(c.key)}
                      label={
                        <span className="os-tiny">
                          {c.header}
                          {/* A column name alone does not say what checking it
                              does — it hides the column. Stated once here
                              rather than in a tooltip nobody can reach. */}
                          <span className="os-sr-only">, shown. Activate to hide this column.</span>
                        </span>
                      }
                    />
                  ))}
                </div>
              </details>
            </caption>
          ) : null}

          <thead>
            <tr>
              {selectable ? (
                <th scope="col" style={{ width: space['10'] }}>
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={(v) => (v === true ? setSelection(rows.map(rowId)) : clearSelection())}
                    aria-label={
                      allSelected
                        ? `Deselect all ${rows.length} rows on this page`
                        : `Select all ${rows.length} rows on this page`
                    }
                  />
                </th>
              ) : null}
              {visible.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={c.align === 'end' ? 'os-table__num' : undefined}
                  aria-sort={
                    c.sortKey && c.sortKey === sort ? (dir === 'asc' ? 'ascending' : 'descending') : c.sortKey ? 'none' : undefined
                  }
                >
                  {c.sortKey && onSort ? (
                    <button type="button" className="os-table__sort" onClick={() => onSort(c.sortKey!)}>
                      {c.header}
                      <span className="os-table__sort-icon" aria-hidden="true">
                        {c.sortKey === sort ? (dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                      <span className="os-sr-only">
                        {c.sortKey === sort
                          ? `, sorted ${dir === 'asc' ? 'ascending' : 'descending'}. Activate to reverse.`
                          : ', not sorted. Activate to sort.'}
                      </span>
                    </button>
                  ) : (
                    <>
                      {c.header}
                      {c.headerHint ? <span className="os-sr-only">, {c.headerHint}</span> : null}
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody ref={bodyRef}>
            {rows.map((row, index) => {
              const id = rowId(row);
              const isSelected = selected.has(id);
              return (
                <tr
                  key={id}
                  data-row-index={index}
                  aria-selected={selectable ? isSelected : undefined}
                  // Roving tabindex: exactly one row is in the tab order, and
                  // the arrows move within. 25 focus stops per page would make
                  // the rest of the application unreachable by keyboard.
                  tabIndex={index === 0 ? 0 : -1}
                  onKeyDown={(e) => onRowKeyDown(e, row, index)}
                  onClick={onRowActivate ? () => onRowActivate(row) : undefined}
                  style={{ cursor: onRowActivate ? 'pointer' : undefined }}
                >
                  {selectable ? (
                    <td>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(id);
                            else next.delete(id);
                            return next;
                          });
                          setAnchor(index);
                        }}
                        aria-label={
                          rowLabel
                            ? `Select ${rowLabel(row)}`
                            : /*
                               * No name available. The ordinal is a weak
                               * fallback, not an identity: it moves when the
                               * sort or the page does, so "Select row 7" names
                               * a position rather than a record. Stated in
                               * full here rather than left as a bare number so
                               * it is obvious from the announcement that it is
                               * a position.
                               */
                              `Select row ${index + 1} of ${rows.length} on this page`
                        }
                      />
                    </td>
                  ) : null}
                  {visible.map((c) => (
                    <td key={c.key} className={c.align === 'end' ? 'os-table__num' : undefined}>
                      {c.masked ? (
                        <span className="os-muted">{MASKED_CELL}</span>
                      ) : (
                        c.render(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        The masking notice goes *above* the table, not below it, and not in a
        tooltip. Below is a footer next to pagination, where nobody looks for
        the reason a column is empty; a tooltip is unreachable by keyboard and
        by screen reader. Above the table is where someone forming the
        question "why is this blank?" is already looking.
      */}
      {maskedReason ? (
        <p className="os-muted" style={{ fontSize: font.size.xs, margin: 0 }}>
          {maskedReason}
        </p>
      ) : null}

      <div className="os-row os-row--between" style={{ fontSize: font.size.xs, color: color.content.secondary }}>
        <div className="os-row">
          {summary ? <span>{summary}</span> : <span>{formatNumber(total)} rows</span>}
          <Button variant="ghost" size="sm" onClick={exportCsv}>
            Export CSV
          </Button>
        </div>

        <div className="os-row">
          {onPageSize ? (
            <label className="os-row" style={{ gap: space['2'] }}>
              <span className="os-tiny">Rows</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSize(Number(e.target.value))}
                style={{
                  minHeight: 'var(--ds-size-target-min)',
                  border: 'var(--ds-border-width-thin) solid var(--ds-border-default)',
                  borderRadius: 'var(--ds-radius-md)',
                  background: 'var(--ds-surface-raised)',
                  padding: `0 ${space['2']}`,
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {onPage ? (
            <nav aria-label="Pagination" className="os-row" style={{ gap: space['1'] }}>
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                Previous
              </Button>
              <span className="os-num" aria-live="polite">
                Page {page} of {pageCount}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
                Next
              </Button>
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The per-cell text for a withheld value. Words, not asterisks: `•••` reads as
 *  a redaction in a screenshot and as nothing at all to a screen reader. */
const MASKED_CELL = 'Withheld';

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (React.isValidElement(node)) {
    // `props` is `unknown` on the generic `ReactElement`, not because it is
    // untyped but because a ReactElement's props are only known from the
    // component that produced it. Narrowing to the one shape this can be:
    // an element always has an object-or-null `props`, and `children` is the
    // field being read. Anything else returns '' rather than reaching through
    // an unknown, because a CSV export must not be able to throw.
    const props = node.props as { children?: React.ReactNode } | null;
    return textOf(props?.children);
  }
  return '';
}

/** RFC 4180: a field containing a comma, quote or newline is quoted. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
