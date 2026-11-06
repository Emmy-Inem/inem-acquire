import app from "./app.js";
app.listen(Number(process.env.API_PORT || 8787), "127.0.0.1", () =>
  console.log(
    "Inem Acquire API ready on port " + (process.env.API_PORT || 8787),
  ),
);
