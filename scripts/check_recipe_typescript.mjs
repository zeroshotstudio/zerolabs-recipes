#!/usr/bin/env node
// Compile the package in the current directory without running live API demos.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
let command;
if (existsSync("tsconfig.json")) {
  command = packageJson.scripts?.build ? ["npm", ["run", "build"]] : ["npx", ["--no-install", "tsc", "--noEmit"]];
} else {
  function sources(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      if (["node_modules", "dist", "build", ".git"].includes(entry.name)) return [];
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? sources(file) : file.endsWith(".ts") ? [file] : [];
    });
  }
  const files = sources(".");
  if (!files.length) throw new Error("Recipe package has no TypeScript source files");
  command = ["npx", ["--no-install", "tsc", "--noEmit", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--esModuleInterop", "--skipLibCheck", ...files]];
}
const result = spawnSync(...command, { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
