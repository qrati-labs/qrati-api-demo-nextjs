import { notFound } from "next/navigation";
import * as raw from "@/app/actions/qrati";

/** An API error (problem+json) returned from a Server Action, rethrown here with its real message and code. */
export class ActionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "ActionError";
  }
}

const isError = (value: unknown): value is { __qratiError: { status: number; code?: string; message: string } } =>
  typeof value === "object" && value !== null && "__qratiError" in value;

/**
 * Every Server Action wrapped so that an API error is thrown (with its message and `code`) on the caller's side.
 * Use this instead of importing app/actions/qrati directly, in client and server components alike.
 */
export const actions = Object.fromEntries(
  Object.entries(raw).map(([name, value]) => [
    name,
    typeof value !== "function"
      ? value
      : async (...args: unknown[]) => {
          const result = await (value as (...a: unknown[]) => Promise<unknown>)(...args);
          if (isError(result)) throw new ActionError(result.__qratiError.message, result.__qratiError.status, result.__qratiError.code);
          return result;
        },
  ])
) as typeof raw;

/** For server components: render Next's 404 page when the API says the resource does not exist. */
export function notFoundOn404(err: unknown): never {
  if (err instanceof ActionError && err.status === 404) notFound();
  throw err;
}
