import "dotenv/config";
import { app } from "./app";
import { fileService } from "./lib/services/file-service";

const PORT = parseInt(process.env.PORT || "4001", 10);
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`[MitFloww API] Server running on http://${HOST}:${PORT}`);

  // Periodic stale job reconciliation (every 60s)
  setInterval(() => {
    fileService
      .reconcileStaleProcessingVersions()
      .catch((err) =>
        console.error("[MitFloww API] Error in reconcileStaleProcessingVersions:", err),
      );
  }, 60_000);
});
