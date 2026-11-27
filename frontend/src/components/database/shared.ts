import type { Column, ColumnOption, ColumnType, Database, DbView, Row } from "@/lib/api";

export const TYPE_LABEL: Record<ColumnType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  status: "Status",
  tags: "Tags",
  date: "Date",
  checkbox: "Checkbox",
  url: "Link",
};

export type DbApi = {
  db: Database;
  rows: Row[];
  editable: boolean;
  saveColumns: (columns: Column[]) => void;
  addOption: (colId: string, o: ColumnOption) => void;
  saveRow: (row: Row, patch: { title?: string; properties?: Record<string, unknown>; position?: number }) => void;
  addRow: (properties?: Record<string, unknown>) => Promise<Row>;
  deleteRow: (row: Row, quiet?: boolean) => void;
  openRow: (id: string) => void;
  setView: (v: DbView) => void;
};
