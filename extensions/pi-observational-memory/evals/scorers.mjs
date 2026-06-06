export function estimateTokens(text) {
  return Math.ceil(String(text).length / 4);
}

export function scoreExactDetailCollision(answer, fixture) {
  const text = String(answer ?? "");
  const { expected } = fixture;
  const required = [expected.cutoff, expected.mountPath, expected.port];
  const requiredHits = required.filter((value) => text.includes(value));

  const distractors = [
    "2026-05-17T03:02:00Z",
    "2026-05-18T03:20:00Z",
    "2026-05-17T03:21:00Z",
    "/mnt/attlas-blue",
    "/mnt/atlas-green",
    "/mnt/atlas_blue",
    "/mnt/atlas-blue-prod",
    "7342",
    "7433",
    "7423",
  ];
  const falseHits = distractors.filter((value) => text.includes(value));
  const mentionsId = text.includes(expected.migrationId);

  const exact = requiredHits.length === required.length && falseHits.length === 0;
  const score = Math.max(0, requiredHits.length / required.length - falseHits.length * 0.25 + (mentionsId ? 0.1 : 0));

  return {
    score: Math.min(1, score),
    exact,
    requiredHits,
    falseHits,
    mentionsId,
  };
}
