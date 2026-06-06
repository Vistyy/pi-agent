#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { exactDetailCollision } from "./fixtures/exact-detail-collision.mjs";
import { estimateTokens, scoreExactDetailCollision } from "./scorers.mjs";

const fixtures = { [exactDetailCollision.id]: exactDetailCollision };
const fixture = fixtures[process.argv[2] ?? exactDetailCollision.id];
if (!fixture) throw new Error(`unknown fixture: ${process.argv[2]}`);

const answerPath = process.argv[3];
const answer = answerPath ? readFileSync(answerPath, "utf8") : "";
const quality = answerPath ? scoreExactDetailCollision(answer, fixture) : undefined;

const costs = {
  transcriptTokens: estimateTokens(fixture.transcript),
  questionTokens: estimateTokens(fixture.question),
  additivePatchTokensTarget: 120,
  expectedObservationTokens: estimateTokens(JSON.stringify(fixture.expected)),
};

const contexts = {
  defaultOnly: `Compacted summary intentionally lossy: Atlas migration discussed; Elena approved one migration after rollback review.\n\nQuestion: ${fixture.question}`,
  additive: `Compacted summary intentionally lossy: Atlas migration discussed; Elena approved one migration after rollback review.\n\nObservational memory patch:\n[aaaaaaaaaaaa] MIG-0427 exact approval: approver Elena; cutoff 2026-05-17T03:20:00Z; mount /mnt/atlas-blue; port 7432; source cue rollback drill green-room review.\n\nQuestion: ${fixture.question}`,
  replacement: `Observational memory summary:\n- MIG-0427 exact approval: approver Elena; cutoff 2026-05-17T03:20:00Z; mount /mnt/atlas-blue; port 7432; source cue rollback drill green-room review.\n\nQuestion: ${fixture.question}`,
};

console.log(JSON.stringify({
  fixture: { id: fixture.id, title: fixture.title, question: fixture.question, expected: fixture.expected },
  costs,
  quality,
  contextTokenEstimates: Object.fromEntries(Object.entries(contexts).map(([k, v]) => [k, estimateTokens(v)])),
  contexts,
}, null, 2));
