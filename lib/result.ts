// Shared shape for every server action's return value.
export type Result = { ok: true; message?: string; id?: string; url?: string } | { ok: false; error: string };

export const ok = (message?: string, extra?: { id?: string; url?: string }): Result => ({ ok: true, message, ...extra });
export const fail = (error: string): Result => ({ ok: false, error });

/** Wraps an action body so thrown errors (auth, validation, uploads) come back as toasts. */
export async function guard(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    const msg = e instanceof Error ? e.message : "Something went wrong";
    if (process.env.NODE_ENV !== "production") console.error(e);
    return fail(msg.length > 200 ? "Something went wrong" : msg);
  }
}

/** FormData helpers. */
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const opt = (fd: FormData, k: string) => str(fd, k) || null;
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
export const all = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);
