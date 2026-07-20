import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("assessment generation path", () => {
  it("still stuffs extractedText into material without RAG resolution", () => {
    const file = resolve(dirname(fileURLToPath(import.meta.url)), "../../workers/processors.ts");
    const source = readFileSync(file, "utf8");
    expect(source).toContain("material: source?.extractedText");
    expect(source).not.toContain("resolveMaterialContext");
    expect(source).not.toContain("useRag");
  });
});
