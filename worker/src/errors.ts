export const errorCodes = [
  "unauthorized",
  "invalid_name",
  "not_found",
  "name_taken",
  "limit_exceeded",
  "invalid_html",
  "bad_request",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export type AppError = {
  code: ErrorCode;
  message: string;
  status: number;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export function appError(code: ErrorCode, message: string, status: number): AppError {
  return { code, message, status };
}

export function errorBody(error: AppError): { error: { code: ErrorCode; message: string } } {
  return { error: { code: error.code, message: error.message } };
}

export const messages = {
  unauthorized: "Invalid or missing API key.",
  invalidName: "Name must be 1–64 chars: lowercase letters, numbers, hyphens.",
  notFound: "Document not found.",
  nameTaken: "That name is already in use.",
  limitDocuments: "This folder holds at most 30 documents.",
  limitBytes: "HTML must be at most 2 MiB.",
  invalidHtml: "HTML is empty.",
  badRequest: "Missing required field.",
} as const;
