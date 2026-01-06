/**
 * Entity Linking Tests
 */

import { describe, expect, it } from "bun:test";
import type { ExtractedEntity } from "../src/index.js";
import { createEntityLinker, EntityLinker } from "../src/index.js";

describe("EntityLinker", () => {
  const linker = createEntityLinker();

  describe("Alias Lookup", () => {
    it("should link Apple to AAPL", async () => {
      const result = await linker.linkEntity("Apple");
      expect(result).not.toBeNull();
      if (result) {
        expect(result.ticker).toBe("AAPL");
        expect(result.confidence).toBeGreaterThan(0.8);
      }
    });

    it("should link Microsoft to MSFT", async () => {
      const result = await linker.linkEntity("Microsoft");
      expect(result).not.toBeNull();
      if (result) {
        expect(result.ticker).toBe("MSFT");
      }
    });

    it("should link Tesla to TSLA", async () => {
      const result = await linker.linkEntity("Tesla");
      expect(result).not.toBeNull();
      if (result) {
        expect(result.ticker).toBe("TSLA");
      }
    });

    it("should link Google/Alphabet to GOOGL", async () => {
      const googleResult = await linker.linkEntity("Google");
      expect(googleResult?.ticker).toBe("GOOGL");

      const alphabetResult = await linker.linkEntity("Alphabet");
      expect(alphabetResult?.ticker).toBe("GOOGL");
    });

    it("should link Meta/Facebook to META", async () => {
      const metaResult = await linker.linkEntity("Meta");
      expect(metaResult?.ticker).toBe("META");

      const fbResult = await linker.linkEntity("Facebook");
      expect(fbResult?.ticker).toBe("META");
    });

    it("should link financial companies", async () => {
      expect((await linker.linkEntity("JPMorgan"))?.ticker).toBe("JPM");
      expect((await linker.linkEntity("Goldman Sachs"))?.ticker).toBe("GS");
      expect((await linker.linkEntity("Bank of America"))?.ticker).toBe("BAC");
    });

    it("should link with partial match", async () => {
      const result = await linker.linkEntity("Apple Inc.");
      expect(result?.ticker).toBe("AAPL");
    });
  });

  describe("Entity Batch Processing", () => {
    it("should link multiple entities", async () => {
      const entities: ExtractedEntity[] = [
        { name: "Apple", type: "company" },
        { name: "Microsoft", type: "company" },
        { name: "John Smith", type: "person" }, // Should be filtered
      ];

      const links = await linker.linkEntities(entities);
      expect(links).toHaveLength(2);
      const firstLink = links[0];
      const secondLink = links[1];
      if (firstLink && secondLink) {
        expect(firstLink.ticker).toBe("AAPL");
        expect(secondLink.ticker).toBe("MSFT");
      }
    });

    it("should use ticker from extraction if provided", async () => {
      const entities: ExtractedEntity[] = [
        { name: "Unknown Company", type: "company", ticker: "XYZ" },
      ];

      const links = await linker.linkEntities(entities);
      expect(links).toHaveLength(1);
      const firstLink = links[0];
      if (firstLink) {
        expect(firstLink.ticker).toBe("XYZ");
        expect(firstLink.method).toBe("exact");
      }
    });

    it("should filter non-company entities", async () => {
      const entities: ExtractedEntity[] = [
        { name: "Tim Cook", type: "person" },
        { name: "iPhone", type: "product" },
      ];

      const links = await linker.linkEntities(entities);
      expect(links).toHaveLength(0);
    });
  });

  describe("Utility Methods", () => {
    it("should extract unique tickers", () => {
      const links = [
        { entityName: "Apple", ticker: "AAPL", confidence: 0.9, method: "alias" as const },
        { entityName: "Apple Inc", ticker: "AAPL", confidence: 0.9, method: "alias" as const },
        { entityName: "Microsoft", ticker: "MSFT", confidence: 0.9, method: "alias" as const },
      ];

      const tickers = EntityLinker.getTickers(links);
      expect(tickers).toHaveLength(2);
      expect(tickers).toContain("AAPL");
      expect(tickers).toContain("MSFT");
    });
  });

  describe("Cache", () => {
    it("should cache results", async () => {
      const freshLinker = createEntityLinker();

      // First call
      const result1 = await freshLinker.linkEntity("Apple");

      // Second call should hit cache
      const result2 = await freshLinker.linkEntity("Apple");

      expect(result1).toEqual(result2);
    });

    it("should clear cache", async () => {
      const freshLinker = createEntityLinker();
      await freshLinker.linkEntity("Apple");

      freshLinker.clearCache();

      // Cache should be empty, but result should still work
      const result = await freshLinker.linkEntity("Apple");
      expect(result?.ticker).toBe("AAPL");
    });
  });
});
