import "dotenv/config";
import app from "./app.js";
import { startAccountDeletionWorker } from "./workers/account-deletion.worker.js";

const PORT = Number(process.env.PORT ?? 5000);

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const stopDeletionWorker = startAccountDeletionWorker();

server.on("close", stopDeletionWorker);
