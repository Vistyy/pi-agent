import type { TokenUsage } from '../lib/types.js';

export type Observation = { id: string; content: string; timestamp: string; sourceEntryIds: string[]; tokenCount: number };
export type Reflection = { id: string; content: string; supportingObservationIds: string[]; tokenCount: number };
export type CuratorActionResult = {
  pinned: Array<{ observationIds: string[]; reason: string }>;
  unpinned: Array<{ observationIds: string[]; reason: string }>;
  flagged: Array<{ observationIds: string[]; reason: string }>;
  dropped: string[];
};

export type OmAgents = {
  runObserver: (args: Record<string, unknown>) => Promise<Observation[] | undefined>;
  runReflector: (args: Record<string, unknown>) => Promise<Reflection[] | undefined>;
  runCurator: (args: Record<string, unknown>) => Promise<CuratorActionResult | undefined>;
};

export type AgentEvalRecord = {
  id: string;
  agent: 'observer' | 'reflector' | 'curator';
  output: unknown;
  judge?: unknown;
  passed: boolean;
  durationMs: number;
  agentDurationMs?: number;
  judgeDurationMs?: number;
  usage?: TokenUsage;
  judgeUsage?: TokenUsage;
  diagnostics?: unknown;
  diagnosis?: unknown;
  diagnosisUsage?: TokenUsage;
  diagnosisDurationMs?: number;
  error?: string;
};

export type CuratorEvalDiagnostics = {
  observations?: Observation[];
  reflections?: Reflection[];
  pinnedObservationIds?: string[];
  flaggedObservationIds?: string[];
  protectedObservationIds?: string[];
  maxDropsAllowed?: number;
  phaseMetrics?: unknown[];
};

export type CuratorCheck = { label: string; pass: (output: CuratorActionResult | undefined) => boolean; detail?: (output: CuratorActionResult | undefined) => unknown };
