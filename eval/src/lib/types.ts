export type Rubric = { pass_if?: string[]; fail_if?: string[] };

export type Probe = {
  id: string;
  question: string;
  rubric: Rubric;
};

export type EvalFile = {
  id: string;
  kind?: string;
  source_session?: string;
  notes?: string;
  compact_before_probe?: boolean;
  compact_instructions?: string;
  compaction_settings?: { keepRecentTokens?: number; reserveTokens?: number };
  expected_behavior?: string[];
  probes: Probe[];
  calibration?: CalibrationExample[];
};

export type CalibrationExample = { id: string; expected_passed: boolean; answer: string };

export type TokenUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: unknown;
};

export type PiInvocation = { kind: 'sdk'; model: string; sessionFile?: string; prompt: string; extensionPaths?: string[]; compactBeforePrompt?: boolean; compactInstructions?: string; compactionSettings?: { keepRecentTokens?: number; reserveTokens?: number }; allowedTools?: string[]; prepareMemoryBeforeCompact?: boolean; memoryPrepareWaitMs?: number; memoryPrepareTurns?: number };

export type AgentResult = {
  fixture: string;
  probe: string;
  invocation: PiInvocation;
  compaction?: unknown;
  executed: boolean;
  exitCode: number | null;
  durationMs: number;
  answer: string;
  stderr: string;
  usage?: TokenUsage;
  answerUsage?: TokenUsage;
  compactionUsage?: TokenUsage;
};

export type JudgeResult = {
  passed: boolean;
  reason: string;
  missing: string[];
  incorrect: string[];
};

export type FailureClassification = 'pass' | 'memory_missing' | 'answer_use_failure' | 'wrong_stale_memory' | 'rubric_or_answer_omission' | 'judge_or_runtime_error';

export type JudgedResult = AgentResult & {
  judge: JudgeResult;
  classification?: FailureClassification;
  judgeExitCode: number | null;
  judgeStderr: string;
  judgeDurationMs?: number;
  judgeUsage?: TokenUsage;
};
