import { createServer } from "node:http";

const propuesta = {
  items: [{
    texto_fuente: "1 puerta Neltume raulí 90x210",
    tipo: "puerta",
    modelo: "Neltume",
    madera: "Raulí",
    ancho_m: 0.9,
    alto_m: 2.1,
    medida_accesorio: null,
    cantidad: 1,
    dudas: [],
  }],
  alertas: [],
  sin_items: false,
};

const servidor = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return void res.writeHead(200).end("ok");
  if (req.method !== "POST" || req.url !== "/openai/v1/chat/completions") return void res.writeHead(404).end();
  req.resume();
  req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      model: "openai/gpt-oss-120b",
      choices: [{
        message: { tool_calls: [{ function: { name: "proponer_items", arguments: JSON.stringify(propuesta) } }] },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    }));
  });
});

servidor.listen(3202, "127.0.0.1");
for (const senal of ["SIGINT", "SIGTERM"] as const) process.on(senal, () => servidor.close(() => process.exit(0)));
