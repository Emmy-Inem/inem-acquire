import { spawn } from "node:child_process";
const node = process.execPath;
const children = [
  spawn(node, ["--watch", "server/index.js"], { stdio: "inherit" }),
  spawn(
    node,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173"],
    { stdio: "inherit" },
  ),
];
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    children.forEach((c) => c.kill());
    process.exit();
  });
children.forEach((c) =>
  c.on("exit", (code) => {
    if (code) {
      children.forEach((other) => other !== c && other.kill());
      process.exit(code);
    }
  }),
);
