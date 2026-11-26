import express from "express";
import fs from "node:fs";
import path from "node:path";
import app, { stats } from "./app.js";

const dist = path.resolve(process.cwd(), "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|evidence).*/, (_q, r) => r.sendFile(path.join(dist, "index.html")));
}
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`PBL Program Intelligence API on http://localhost:${port}  (${stats.schools} schools × ${stats.months} months, LLM ${stats.llm ? "enabled" : "off"})`));
