import { backendCredentials } from "../helpers/domain.js";
import { startServer } from "./server.js";

// Fail fast with a readable message if .env is incomplete.
backendCredentials();

await startServer();
