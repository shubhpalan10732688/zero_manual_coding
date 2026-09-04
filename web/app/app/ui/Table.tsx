import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  render: (row: T) => ReactNode;
}

/**
 * Table shared by every list view. Rows can carry an href so the whole row becomes the
 * drill-down target rather than only the first cell.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty = 'Nothing to show for this period.',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="ui-empty">{empty}</p>;

  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.numeric ? 'ui-num' : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr key={rowKey(row)}>
                {columns.map((column, index) => (
                  <td key={column.key} className={column.numeric ? 'ui-num' : undefined}>
                    {index === 0 && href ? (
                      <a href={href} style={{ display: 'block' }}>
                        {column.render(row)}
                      </a>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** First-column cell: a primary label with a quieter qualifier underneath. */
export function CellStack({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <div className="ui-cell-main">{main}</div>
      {sub && <div className="ui-cell-sub">{sub}</div>}
    </>
  );
}
