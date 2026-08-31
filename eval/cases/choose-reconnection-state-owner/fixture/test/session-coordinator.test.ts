import assert from "node:assert/strict";
import test from "node:test";

import { SessionCoordinator } from "../src/session-coordinator.js";

test("reconnection state survives workspace replacement", () => {
  const coordinator = new SessionCoordinator({ id: "workspace-a" });
  coordinator.updateReconnectionState("resume-token", 42);

  coordinator.replaceWorkspace({ id: "workspace-b" });

  assert.equal(coordinator.reconnect(), "resume-token");
});
