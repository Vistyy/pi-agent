import type { TokenUsage } from '../lib/types.js';

export type Observation = { id: string; content: string; timestamp: string; sourceEntryIds: string[]; tokenCount: number };
export type Reflection = { id: string; content: string; sources: string[]; tokenCount: number };

export type RewriteResult = { reflections: Reflection[]; summary?: string };

export type OmAgents = {
  runObserver: (args: Record<string, unknown>) => Promise<Observation[] | undefined>;
  runReflector: (args: Record<string, unknown>) => Promise<Reflection[] | undefined>;
  runRewrite: (args: Record<string, unknown>) => Promise<RewriteResult | undefined>;
};

export type AgentEvalRecord = {
  id: string;
  agent: 'observer' | 'reflector' | 'rewrite';
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
  score?: EvalScore;
};

export type EvalScoreDimension = { label: string; score: number; maxScore: number; detail?: unknown };
export type EvalScore = { hardFailed: boolean; score: number; maxScore: number; dimensions: EvalScoreDimension[] };

export type ObserverCheck = { label: string; pass: (output: Observation[] | undefined) => boolean; detail?: (output: Observation[] | undefined) => unknown };
export type ReflectorCheck = { label: string; pass: (output: Reflection[] | undefined) => boolean; detail?: (output: Reflection[] | undefined) => unknown };
export type ReflectionEvalDiagnostics = { observations?: Observation[]; reflections?: Reflection[]; flaggedObservationIds?: string[] };
