type ErrorLike = {
  code?: unknown;
  errorCode?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

export function isNotFoundLikeError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as ErrorLike;

  if (candidate.status === 404 || candidate.statusCode === 404) {
    return true;
  }

  const code = String(candidate.code ?? candidate.errorCode ?? "").toLowerCase();
  const name = String(candidate.name ?? "").toLowerCase();

  return (
    code === "not_found" ||
    code.endsWith("_not_found") ||
    code.includes("not_found") ||
    name.includes("notfound")
  );
}