import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.env.NO_UPDATE_NOTIFIER = "1";
const webExtEntry = import.meta.resolve("web-ext");
const { main } = await import("web-ext");

await main(dirname(fileURLToPath(webExtEntry)), { argv: process.argv.slice(2) });
