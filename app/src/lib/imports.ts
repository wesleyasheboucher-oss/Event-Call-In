import "server-only";
import { all, get } from "./db";

export type ImportAction = "added" | "updated" | "skipped" | "in_file" | "error";

export type ImportSummary = {
  id: number;
  file_name: string;
  mode: "skip" | "merge" | "update";
  tag_name: string;
  created_at: string;
  user_name: string | null;
  added: number;
  updated: number;
  skipped: number;
  in_file: number;
  errors: number;
  undone: number;
};

const SUMMARY_SQL = `
  SELECT i.id, i.file_name, i.mode, i.tag_name, i.created_at, u.name AS user_name,
         COUNT(*) FILTER (WHERE c.action = 'added') AS added,
         COUNT(*) FILTER (WHERE c.action = 'updated') AS updated,
         COUNT(*) FILTER (WHERE c.action = 'skipped') AS skipped,
         COUNT(*) FILTER (WHERE c.action = 'in_file') AS in_file,
         COUNT(*) FILTER (WHERE c.action = 'error') AS errors,
         COUNT(*) FILTER (WHERE c.undone_at IS NOT NULL) AS undone
    FROM imports i
    LEFT JOIN users u ON u.id = i.user_id
    LEFT JOIN import_changes c ON c.import_id = i.id`;

export async function listImports(): Promise<ImportSummary[]> {
  return all<ImportSummary>(`${SUMMARY_SQL} GROUP BY i.id, u.name ORDER BY i.created_at DESC, i.id DESC`);
}

export type ImportChange = {
  id: number;
  action: ImportAction;
  row_number: number;
  name: string;
  contact_id: number | null;
  /** current name of the contact, which may differ from the file's (e.g. a match by phone) */
  contact_name: string | null;
  changes: Record<string, [string | number, string | number]>;
  reason: string;
  undone_at: string | null;
};

export async function getImport(id: number): Promise<{ summary: ImportSummary; changes: ImportChange[] } | null> {
  const summary = await get<ImportSummary>(`${SUMMARY_SQL} WHERE i.id = ? GROUP BY i.id, u.name`, [id]);
  if (!summary) return null;
  const rows = await all<Omit<ImportChange, "changes"> & { changes: string }>(
    `SELECT c.id, c.action, c.row_number, c.name, c.contact_id, c.reason, c.undone_at, c.changes,
            ct.first_name || ' ' || ct.last_name AS contact_name
       FROM import_changes c LEFT JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.import_id = ? ORDER BY c.row_number, c.id`,
    [id],
  );
  return { summary, changes: rows.map((r) => ({ ...r, changes: JSON.parse(r.changes || "{}") })) };
}
