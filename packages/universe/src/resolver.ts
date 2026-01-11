/**
 * Universe Resolver
 *
 * Main entry point for resolving a complete universe configuration.
 * Handles source composition, filtering, diversification, and limits.
 *
 * @see docs/plans/11-configuration.md lines 355-700
 */

import type { UniverseConfig, UniverseFilters, UniverseSource } from "@cream/config";

import { createFMPClient, type FMPClientConfig } from "./fmp-client.js";
import {
  type ResolvedInstrument,
  resolveSource,
  type SourceResolutionResult,
  type SourceResolverOptions,
} from "./sources.js";

// ============================================
// Types
// ============================================

/**
 * Universe resolution result
 */
export interface UniverseResolutionResult {
  /** Final resolved instruments */
  instruments: ResolvedInstrument[];
  /** Individual source results */
  sourceResults: SourceResolutionResult[];
  /** Composition mode used */
  composeMode: "union" | "intersection";
  /** Resolution timestamp */
  resolvedAt: string;
  /** Warnings from resolution */
  warnings: string[];
  /** Statistics */
  stats: {
    /** Total from sources before filtering */
    totalFromSources: number;
    /** After composition */
    afterComposition: number;
    /** After filters */
    afterFilters: number;
    /** After diversification */
    afterDiversification: number;
    /** Final count */
    final: number;
    /** Sectors represented */
    sectors: string[];
  };
}

/**
 * Universe resolver options
 */
export interface UniverseResolverOptions extends SourceResolverOptions {
  /** Skip API calls for disabled sources */
  skipDisabled?: boolean;
}

// ============================================
// Composition Functions
// ============================================

/**
 * Compose instruments from multiple sources using union (combine all, dedupe)
 */
function composeUnion(sourceResults: SourceResolutionResult[]): ResolvedInstrument[] {
  const symbolMap = new Map<string, ResolvedInstrument>();

  for (const result of sourceResults) {
    for (const instrument of result.instruments) {
      const existing = symbolMap.get(instrument.symbol);
      if (existing) {
        const merged: ResolvedInstrument = {
          symbol: instrument.symbol,
          source: `${existing.source},${instrument.source}`,
        };
        const name = existing.name ?? instrument.name;
        const sector = existing.sector ?? instrument.sector;
        const industry = existing.industry ?? instrument.industry;
        const marketCap = existing.marketCap ?? instrument.marketCap;
        const avgVolume = existing.avgVolume ?? instrument.avgVolume;
        const price = existing.price ?? instrument.price;
        if (name !== undefined) {
          merged.name = name;
        }
        if (sector !== undefined) {
          merged.sector = sector;
        }
        if (industry !== undefined) {
          merged.industry = industry;
        }
        if (marketCap !== undefined) {
          merged.marketCap = marketCap;
        }
        if (avgVolume !== undefined) {
          merged.avgVolume = avgVolume;
        }
        if (price !== undefined) {
          merged.price = price;
        }
        symbolMap.set(instrument.symbol, merged);
      } else {
        symbolMap.set(instrument.symbol, instrument);
      }
    }
  }

  return Array.from(symbolMap.values());
}

/**
 * Compose instruments using intersection (only those in ALL sources)
 */
function composeIntersection(sourceResults: SourceResolutionResult[]): ResolvedInstrument[] {
  if (sourceResults.length === 0) {
    return [];
  }
  if (sourceResults.length === 1) {
    const firstResult = sourceResults[0];
    if (!firstResult) {
      return [];
    }
    return firstResult.instruments;
  }

  const symbolSets = sourceResults.map(
    (result) => new Set(result.instruments.map((i) => i.symbol))
  );

  const firstSet = symbolSets[0];
  if (!firstSet) {
    return [];
  }
  const intersection = new Set(
    Array.from(firstSet).filter((symbol) => symbolSets.every((set) => set.has(symbol)))
  );

  const symbolMap = new Map<string, ResolvedInstrument>();

  for (const result of sourceResults) {
    for (const instrument of result.instruments) {
      if (!intersection.has(instrument.symbol)) {
        continue;
      }

      const existing = symbolMap.get(instrument.symbol);
      if (existing) {
        const merged: ResolvedInstrument = {
          symbol: instrument.symbol,
          source: `${existing.source},${instrument.source}`,
        };
        const name = existing.name ?? instrument.name;
        const sector = existing.sector ?? instrument.sector;
        const industry = existing.industry ?? instrument.industry;
        const marketCap = existing.marketCap ?? instrument.marketCap;
        const avgVolume = existing.avgVolume ?? instrument.avgVolume;
        const price = existing.price ?? instrument.price;
        if (name !== undefined) {
          merged.name = name;
        }
        if (sector !== undefined) {
          merged.sector = sector;
        }
        if (industry !== undefined) {
          merged.industry = industry;
        }
        if (marketCap !== undefined) {
          merged.marketCap = marketCap;
        }
        if (avgVolume !== undefined) {
          merged.avgVolume = avgVolume;
        }
        if (price !== undefined) {
          merged.price = price;
        }
        symbolMap.set(instrument.symbol, merged);
      } else {
        symbolMap.set(instrument.symbol, instrument);
      }
    }
  }

  return Array.from(symbolMap.values());
}

// ============================================
// Filter Functions
// ============================================

/**
 * Apply post-resolution filters
 */
async function applyFilters(
  instruments: ResolvedInstrument[],
  filters: UniverseFilters | undefined,
  fmpConfig?: Partial<FMPClientConfig>
): Promise<{ instruments: ResolvedInstrument[]; warnings: string[] }> {
  if (!filters) {
    return { instruments, warnings: [] };
  }

  const warnings: string[] = [];
  let filtered = [...instruments];

  // Fetch missing metadata if needed for filtering
  const needsMetadata =
    filters.min_avg_volume > 0 ||
    filters.min_market_cap > 0 ||
    filters.min_price > 0 ||
    filters.max_price !== undefined ||
    (filters.include_sectors && filters.include_sectors.length > 0) ||
    (filters.exclude_sectors && filters.exclude_sectors.length > 0);

  if (needsMetadata) {
    const symbolsNeedingData = filtered
      .filter((i) => !i.marketCap || !i.avgVolume || !i.price || !i.sector)
      .map((i) => i.symbol);

    if (symbolsNeedingData.length > 0) {
      try {
        const client = createFMPClient(fmpConfig);
        const profiles = await client.getCompanyProfiles(symbolsNeedingData);

        for (const instrument of filtered) {
          const profile = profiles.get(instrument.symbol);
          if (profile) {
            instrument.name = instrument.name ?? profile.companyName;
            instrument.sector = instrument.sector ?? profile.sector;
            instrument.industry = instrument.industry ?? profile.industry;
            instrument.marketCap = instrument.marketCap ?? profile.mktCap;
            instrument.avgVolume = instrument.avgVolume ?? profile.volAvg;
            instrument.price = instrument.price ?? profile.price;
          }
        }
      } catch (error) {
        warnings.push(`Failed to fetch metadata for filtering: ${error}`);
      }
    }
  }

  if (filters.min_avg_volume > 0) {
    const before = filtered.length;
    filtered = filtered.filter((i) => (i.avgVolume ?? 0) >= filters.min_avg_volume);
    if (filtered.length < before) {
      warnings.push(`Filtered ${before - filtered.length} instruments below min volume`);
    }
  }

  if (filters.min_market_cap > 0) {
    const before = filtered.length;
    filtered = filtered.filter((i) => (i.marketCap ?? 0) >= filters.min_market_cap);
    if (filtered.length < before) {
      warnings.push(`Filtered ${before - filtered.length} instruments below min market cap`);
    }
  }

  if (filters.min_price > 0) {
    const before = filtered.length;
    filtered = filtered.filter((i) => (i.price ?? 0) >= filters.min_price);
    if (filtered.length < before) {
      warnings.push(`Filtered ${before - filtered.length} instruments below min price`);
    }
  }

  if (filters.max_price !== undefined) {
    const maxPrice = filters.max_price;
    const before = filtered.length;
    filtered = filtered.filter((i) => (i.price ?? Number.POSITIVE_INFINITY) <= maxPrice);
    if (filtered.length < before) {
      warnings.push(`Filtered ${before - filtered.length} instruments above max price`);
    }
  }

  if (filters.exclude_tickers.length > 0) {
    const excludeSet = new Set(filters.exclude_tickers.map((t: string) => t.toUpperCase()));
    const before = filtered.length;
    filtered = filtered.filter((i) => !excludeSet.has(i.symbol.toUpperCase()));
    if (filtered.length < before) {
      warnings.push(`Excluded ${before - filtered.length} instruments by ticker blocklist`);
    }
  }

  if (filters.include_sectors && filters.include_sectors.length > 0) {
    const includeSet = new Set(filters.include_sectors.map((s: string) => s.toLowerCase()));
    const before = filtered.length;
    filtered = filtered.filter((i) => {
      if (!i.sector) {
        return false;
      }
      return includeSet.has(i.sector.toLowerCase());
    });
    if (filtered.length < before) {
      warnings.push(`Filtered ${before - filtered.length} instruments not in included sectors`);
    }
  }

  if (filters.exclude_sectors && filters.exclude_sectors.length > 0) {
    const excludeSet = new Set(filters.exclude_sectors.map((s: string) => s.toLowerCase()));
    const before = filtered.length;
    filtered = filtered.filter((i) => {
      if (!i.sector) {
        return true;
      }
      return !excludeSet.has(i.sector.toLowerCase());
    });
    if (filtered.length < before) {
      warnings.push(`Excluded ${before - filtered.length} instruments by sector blocklist`);
    }
  }

  return { instruments: filtered, warnings };
}

// ============================================
// Diversification Functions
// ============================================

/**
 * Diversification configuration (optional extension to UniverseConfig)
 */
export interface DiversificationConfig {
  /** Maximum instruments per sector */
  maxPerSector?: number;
  /** Maximum instruments per industry */
  maxPerIndustry?: number;
  /** Minimum sectors that must be represented */
  minSectorsRepresented?: number;
}

/**
 * Apply diversification rules
 */
function applyDiversification(
  instruments: ResolvedInstrument[],
  config: UniverseConfig
): { instruments: ResolvedInstrument[]; warnings: string[] } {
  const warnings: string[] = [];
  let filtered = [...instruments];

  const diversify = (config as UniverseConfig & { diversification?: DiversificationConfig })
    .diversification;

  if (!diversify) {
    return { instruments: filtered, warnings };
  }

  if (diversify.maxPerSector && diversify.maxPerSector > 0) {
    const sectorCounts = new Map<string, number>();
    const diversified: ResolvedInstrument[] = [];

    for (const instrument of filtered) {
      const sector = instrument.sector ?? "Unknown";
      const count = sectorCounts.get(sector) ?? 0;

      if (count < diversify.maxPerSector) {
        diversified.push(instrument);
        sectorCounts.set(sector, count + 1);
      }
    }

    const removed = filtered.length - diversified.length;
    if (removed > 0) {
      warnings.push(`Diversification: removed ${removed} instruments exceeding sector limits`);
    }
    filtered = diversified;
  }

  if (diversify.maxPerIndustry && diversify.maxPerIndustry > 0) {
    const industryCounts = new Map<string, number>();
    const diversified: ResolvedInstrument[] = [];

    for (const instrument of filtered) {
      const industry = instrument.industry ?? "Unknown";
      const count = industryCounts.get(industry) ?? 0;

      if (count < diversify.maxPerIndustry) {
        diversified.push(instrument);
        industryCounts.set(industry, count + 1);
      }
    }

    const removed = filtered.length - diversified.length;
    if (removed > 0) {
      warnings.push(`Diversification: removed ${removed} instruments exceeding industry limits`);
    }
    filtered = diversified;
  }

  if (diversify.minSectorsRepresented && diversify.minSectorsRepresented > 0) {
    const sectorsPresent = new Set(filtered.filter((i) => i.sector).map((i) => i.sector as string));
    if (sectorsPresent.size < diversify.minSectorsRepresented) {
      warnings.push(
        `Warning: only ${sectorsPresent.size} sectors represented, ` +
          `below minimum of ${diversify.minSectorsRepresented}`
      );
    }
  }

  return { instruments: filtered, warnings };
}

// ============================================
// Ranking Functions
// ============================================

/**
 * Rank and limit instruments
 */
function rankAndLimit(
  instruments: ResolvedInstrument[],
  maxInstruments: number
): ResolvedInstrument[] {
  if (instruments.length <= maxInstruments) {
    return instruments;
  }

  const ranked = instruments.toSorted((a, b) => {
    const aVol = a.avgVolume ?? 0;
    const bVol = b.avgVolume ?? 0;
    return bVol - aVol;
  });

  return ranked.slice(0, maxInstruments);
}

// ============================================
// Main Resolver
// ============================================

/**
 * Resolve a complete universe configuration
 */
export async function resolveUniverse(
  config: UniverseConfig,
  options: UniverseResolverOptions = {}
): Promise<UniverseResolutionResult> {
  const warnings: string[] = [];
  const sourceResults: SourceResolutionResult[] = [];

  const enabledSources = config.sources.filter((s: UniverseSource) => s.enabled);

  if (enabledSources.length === 0) {
    throw new Error("No enabled sources in universe configuration");
  }

  for (const source of enabledSources) {
    try {
      const result = await resolveSource(source, options);
      sourceResults.push(result);
      warnings.push(...result.warnings);
    } catch (error) {
      warnings.push(`Failed to resolve source ${source.name}: ${error}`);
    }
  }

  if (sourceResults.length === 0) {
    throw new Error("All sources failed to resolve");
  }

  const totalFromSources = sourceResults.reduce((sum, r) => sum + r.instruments.length, 0);

  const composeMode = config.compose_mode;
  let instruments =
    composeMode === "intersection"
      ? composeIntersection(sourceResults)
      : composeUnion(sourceResults);

  const afterComposition = instruments.length;

  const filterResult = await applyFilters(instruments, config.filters, options.fmpConfig);
  instruments = filterResult.instruments;
  warnings.push(...filterResult.warnings);

  const afterFilters = instruments.length;

  const diversifyResult = applyDiversification(instruments, config);
  instruments = diversifyResult.instruments;
  warnings.push(...diversifyResult.warnings);

  const afterDiversification = instruments.length;

  instruments = rankAndLimit(instruments, config.max_instruments);

  const sectors = [...new Set(instruments.filter((i) => i.sector).map((i) => i.sector as string))];

  return {
    instruments,
    sourceResults,
    composeMode,
    resolvedAt: new Date().toISOString(),
    warnings,
    stats: {
      totalFromSources,
      afterComposition,
      afterFilters,
      afterDiversification,
      final: instruments.length,
      sectors,
    },
  };
}

/**
 * Get just the ticker symbols from a universe config
 */
export async function resolveUniverseSymbols(
  config: UniverseConfig,
  options: UniverseResolverOptions = {}
): Promise<string[]> {
  const result = await resolveUniverse(config, options);
  return result.instruments.map((i) => i.symbol);
}
