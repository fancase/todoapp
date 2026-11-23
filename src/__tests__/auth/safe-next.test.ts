import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/board/2026-01-01")).toBe("/board/2026-01-01");
    expect(safeNextPath("/weekly?x=1#a")).toBe("/weekly?x=1#a");
  });

  it("rejects external, protocol-relative and malformed targets", () => {
    for (const v of [
      undefined,
      null,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "javascript:alert(1)",
      "board",
      "/.//evil.example",
      "/x/..//evil.example",
      "/%2e//evil.example",
    ]) {
      expect(safeNextPath(v)).toBe("/");
    }
  });
});
