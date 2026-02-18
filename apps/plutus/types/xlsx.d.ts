declare module 'xlsx' {
  export type WorkSheet = unknown;

  export type WorkBook = {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet | undefined>;
  };

  export function read(data: Uint8Array | ArrayBuffer | string, options?: Record<string, unknown>): WorkBook;

  export const utils: {
    sheet_to_json<T = unknown>(worksheet: WorkSheet, options?: Record<string, unknown>): T[];
  };
}
