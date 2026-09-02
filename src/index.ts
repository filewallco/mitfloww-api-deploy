import "dotenv/config";
import { app } from "./app";

const PORT = parseInt(process.env.PORT || "4001", 10);
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`[MitFloww API] Server running on http://${HOST}:${PORT}`);
});
