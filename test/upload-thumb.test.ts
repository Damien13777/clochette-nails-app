import { describe, expect, it } from "vitest";
import { thumbUrl } from "@/lib/upload-thumb";

describe("thumbUrl", () => {
  it("insère -thumb avant l'extension (cover blog)", () => {
    expect(thumbUrl("/uploads/blog/abc-123.webp")).toBe(
      "/uploads/blog/abc-123-thumb.webp",
    );
  });

  it("gère les covers ebooks", () => {
    expect(thumbUrl("/uploads/ebook-covers/x.webp")).toBe(
      "/uploads/ebook-covers/x-thumb.webp",
    );
  });

  it("ne touche que la dernière extension", () => {
    expect(thumbUrl("/uploads/blog/a.b.webp")).toBe("/uploads/blog/a.b-thumb.webp");
  });

  it("laisse l'URL inchangée si pas d'extension reconnue (fallback sûr)", () => {
    expect(thumbUrl("/uploads/blog/noext")).toBe("/uploads/blog/noext");
  });
});
