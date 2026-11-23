// Safety guard shared by the E2E launcher: the run must only ever talk to a local database.
export function assertLocalMongoUri(uri) {
  let host;
  try {
    host = new URL(uri).hostname;
  } catch {
    throw new Error("E2E guard: MONGODB_URI is not a parseable URL; aborting.");
  }
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`E2E guard: refusing to run, MONGODB_URI host is "${host}" (only 127.0.0.1 or localhost allowed).`);
  }
}
