/**
 * Company Relationship Mastra Tool Definitions
 *
 * Tools for querying company relationships from the HelixDB company graph.
 * Enables agents to reason about sector peers, competitors, and supply chains.
 */

import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  getCompanyRelationships,
  getSectorPeers,
  getSupplyChain,
} from "../implementations/companyRelationship.js";

/**
 * Create ExecutionContext for tool invocation.
 */
function createToolContext() {
  return createContext(requireEnv(), "scheduled");
}

// ============================================
// Schemas
// ============================================

const RelatedCompanySchema = z.object({
  symbol: z.string().describe("Company ticker symbol"),
  relationshipType: z
    .enum(["SECTOR_PEER", "SUPPLY_CHAIN", "COMPETITOR", "CUSTOMER"])
    .describe("Type of relationship"),
});

const DependencySchema = z.object({
  symbol: z.string().describe("Company ticker symbol"),
  dependencyType: z.enum(["SUPPLIER", "CUSTOMER", "PARTNER"]).describe("Type of dependency"),
  strength: z.number().min(0).max(1).describe("Dependency strength (0-1, 1 = strongest)"),
});

export const CompanyRelationshipsInputSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .max(10)
    .describe("Company ticker symbol to query relationships for (e.g., 'AAPL')"),
});

export const CompanyRelationshipsOutputSchema = z.object({
  symbol: z.string().describe("The queried company symbol"),
  relatedCompanies: z
    .array(RelatedCompanySchema)
    .describe("Related companies (sector peers, competitors, customers)"),
  dependencies: z
    .array(DependencySchema)
    .describe("Companies this company depends on (suppliers, partners)"),
  dependents: z.array(DependencySchema).describe("Companies that depend on this company"),
  executionTimeMs: z.number().describe("Query execution time in milliseconds"),
});

export const SectorPeersInputSchema = z.object({
  symbol: z.string().min(1).max(10).describe("Company ticker symbol (e.g., 'NVDA')"),
});

export const SectorPeersOutputSchema = z.object({
  symbol: z.string().describe("The queried company symbol"),
  peers: z.array(z.string()).describe("Sector peer ticker symbols"),
});

export const SupplyChainInputSchema = z.object({
  symbol: z.string().min(1).max(10).describe("Company ticker symbol (e.g., 'TSLA')"),
});

export const SupplyChainOutputSchema = z.object({
  symbol: z.string().describe("The queried company symbol"),
  suppliers: z.array(DependencySchema).describe("Upstream suppliers"),
  customers: z.array(DependencySchema).describe("Downstream customers"),
});

export type CompanyRelationshipsInput = z.infer<typeof CompanyRelationshipsInputSchema>;
export type CompanyRelationshipsOutput = z.infer<typeof CompanyRelationshipsOutputSchema>;
export type SectorPeersInput = z.infer<typeof SectorPeersInputSchema>;
export type SectorPeersOutput = z.infer<typeof SectorPeersOutputSchema>;
export type SupplyChainInput = z.infer<typeof SupplyChainInputSchema>;
export type SupplyChainOutput = z.infer<typeof SupplyChainOutputSchema>;

// ============================================
// Tool Definitions
// ============================================

export const companyRelationshipsTool = createTool({
  id: "company_relationships",
  description: `Query all relationships for a company from the HelixDB company graph.

Use this tool when you need to understand:
- What companies are in the same sector as a given company (sector peers)
- Who are the company's competitors
- What companies are in the supply chain
- Who depends on this company (downstream customers/partners)

Returns:
- relatedCompanies: Sector peers, competitors, and related companies
- dependencies: Companies this company depends on (suppliers, partners)
- dependents: Companies that depend on this company

Example queries:
- "What companies are related to NVDA?" → Get NVDA's peers, competitors, and supply chain
- "Who are AAPL's suppliers?" → Check dependencies with type SUPPLIER
- "What companies depend on TSMC?" → Check dependents to find downstream companies

BACKTEST mode: Returns empty results.
PAPER/LIVE mode: Queries HelixDB company graph.`,
  inputSchema: CompanyRelationshipsInputSchema,
  outputSchema: CompanyRelationshipsOutputSchema,
  execute: async (inputData): Promise<CompanyRelationshipsOutput> => {
    const ctx = createToolContext();
    return getCompanyRelationships(ctx, inputData.symbol);
  },
});

export const sectorPeersTool = createTool({
  id: "sector_peers",
  description: `Get sector peer companies for a given ticker symbol.

Use this tool when you need to:
- Find companies in the same sector for comparison
- Identify sector-wide trends by analyzing peer behavior
- Build a peer group for relative valuation analysis

Returns a list of ticker symbols that are sector peers.

Example: "Get sector peers for AMD" → Returns ["NVDA", "INTC", "QCOM", ...]

BACKTEST mode: Returns empty peers list.
PAPER/LIVE mode: Queries HelixDB company graph.`,
  inputSchema: SectorPeersInputSchema,
  outputSchema: SectorPeersOutputSchema,
  execute: async (inputData): Promise<SectorPeersOutput> => {
    const ctx = createToolContext();
    return getSectorPeers(ctx, inputData.symbol);
  },
});

export const supplyChainTool = createTool({
  id: "supply_chain",
  description: `Get supply chain relationships for a company.

Use this tool when you need to understand:
- Upstream suppliers: Who provides components/services to this company
- Downstream customers: Who buys from this company
- Supply chain risks: If a supplier has issues, what companies are affected

The strength field (0-1) indicates how important the relationship is:
- 1.0 = Critical dependency (single source, high revenue %)
- 0.5 = Moderate dependency
- 0.1 = Minor dependency

Example: "What is TSLA's supply chain?" → Returns suppliers (battery, chips) and customers

BACKTEST mode: Returns empty supply chain.
PAPER/LIVE mode: Queries HelixDB company graph.`,
  inputSchema: SupplyChainInputSchema,
  outputSchema: SupplyChainOutputSchema,
  execute: async (inputData): Promise<SupplyChainOutput> => {
    const ctx = createToolContext();
    return getSupplyChain(ctx, inputData.symbol);
  },
});

/**
 * All company relationship tools
 */
export const companyRelationshipTools = [
  companyRelationshipsTool,
  sectorPeersTool,
  supplyChainTool,
];
