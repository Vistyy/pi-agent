export const exactDetailCollision = {
  id: "exact-detail-collision",
  title: "Exact detail retention under near-duplicate project facts",
  expected: {
    migrationId: "MIG-0427",
    approver: "Elena",
    cutoff: "2026-05-17T03:20:00Z",
    mountPath: "/mnt/atlas-blue",
    port: "7432",
    sourceCue: "rollback drill green-room review",
  },
  question:
    "For the migration Elena approved after the rollback drill green-room review, what exact cutoff timestamp, mount path, and port did we settle on?",
  transcript: buildTranscript(),
};

function buildTranscript() {
  const rows = [
    ["MIG-0419", "Eleni", "2026-05-17T03:02:00Z", "/mnt/atlas-blue", "7342", "preflight review"],
    ["MIG-0420", "Elena", "2026-05-17T03:20:00Z", "/mnt/attlas-blue", "7432", "rollback drill dry run"],
    ["MIG-0421", "Elena", "2026-05-17T03:02:00Z", "/mnt/atlas-green", "7432", "rollback drill green-room review"],
    ["MIG-0422", "Elaine", "2026-05-17T03:20:00Z", "/mnt/atlas-blue", "7342", "rollback drill green-room review"],
    ["MIG-0423", "Elena", "2026-05-18T03:20:00Z", "/mnt/atlas-blue", "7432", "capacity review"],
    ["MIG-0424", "Elena", "2026-05-17T03:20:00Z", "/mnt/atlas-blue", "7433", "rollback drill red-room review"],
    ["MIG-0425", "Elena", "2026-05-17T03:21:00Z", "/mnt/atlas-blue", "7432", "rollback drill green room review"],
    ["MIG-0426", "Elena", "2026-05-17T03:20:00Z", "/mnt/atlas_blue", "7432", "rollback drill green-room review"],
    ["MIG-0427", "Elena", "2026-05-17T03:20:00Z", "/mnt/atlas-blue", "7432", "rollback drill green-room review"],
    ["MIG-0428", "Elena", "2026-05-17T03:20:00Z", "/mnt/atlas-blue", "7423", "rollback drill green-room review"],
    ["MIG-0429", "Elena", "2026-05-17T03:20:00Z", "/mnt/atlas-blue-prod", "7432", "rollback drill green-room review"],
  ];

  const intro = [
    "We tracked atlas cutover candidates. Similar IDs intentionally reused values; do not infer from majority values.",
    "Final approval is only valid when the approval note says exact phrase: rollback drill green-room review.",
  ];
  const body = rows.map(([id, approver, cutoff, path, port, cue]) =>
    `${id}: approver=${approver}; cutoff=${cutoff}; mount=${path}; port=${port}; approval_note=${cue}.`,
  );
  const noise = Array.from({ length: 28 }, (_, i) =>
    `Routine deploy log ${String(i + 1).padStart(2, "0")}: shard=${(i % 7) + 1}; retry=${i % 3}; harmless healthcheck output; atlas token ${rows[i % rows.length][0]}.`,
  );
  return [...intro, ...noise.slice(0, 14), ...body.slice(0, 5), ...noise.slice(14), ...body.slice(5)].join("\n");
}
