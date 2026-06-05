import "dotenv/config";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      fincraBase: process.env.FINCRA_API_BASE_URL,
      env: process.env.NODE_ENV ?? "development",
    },
    `AfriKart payment service running on port ${PORT}`,
  );
});
