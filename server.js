import express from "express";
import http from "http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// --- SENHA DE ADMIN ---
const ADMIN_PASSWORD = "mudar123";

// --- NOVO: CONTROLE DE ESTADO DA LISTA ---
let isListOpen = true; // Começa aberta por padrão

// --- Função para formatar o nome ---
function toTitleCase(str) {
  if (!str) return "";
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

// --- Configuração base ---
const app = express();
const server = http.createServer(app);
app.use(cors());
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.json());

// --- Servir o frontend ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// --- Banco de dados SQLite ---
let db;
try {
  db = await open({
    filename: "./db.sqlite",
    driver: sqlite3.Database,
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS combinacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT, n1 INTEGER, n2 INTEGER, n3 INTEGER
    )
  `);
  console.log("Banco de dados conectado.");
} catch (e) {
  console.error("Erro no DB:", e);
  process.exit(1);
}

// --- Rota: buscar combinações ---
app.get("/combinacoes", async (req, res) => {
  const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
  res.json(lista);
});

// --- Rota: adicionar combinação ---
app.post("/combinacoes", async (req, res) => {
  // --- MUDANÇA IMPORTANTE ---
  // 1. Verifica se a lista está aberta
  if (!isListOpen) {
    return res.status(403).json({ error: "A lista está fechada." });
  }
  // --- FIM DA MUDANÇA ---

  try {
    const { nome, n1, n2, n3 } = req.body;
    if (!nome || !n1 || !n2 || !n3) {
      return res.status(400).send("Dados inválidos");
    }

    const nomeFormatado = toTitleCase(nome.trim());
    await db.run(
      "INSERT INTO combinacoes (nome, n1, n2, n3) VALUES (?, ?, ?, ?)",
      [nomeFormatado, n1, n2, n3]
    );

    const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
    io.emit("update", lista);
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Rota: deletar combinação (ADMIN) ---
app.delete("/combinacoes/:id", async (req, res) => {
  const { adminPassword } = req.body;
  const { id } = req.params;
  if (adminPassword !== ADMIN_PASSWORD)
    return res.status(401).send("Senha inválida");
  try {
    await db.run("DELETE FROM combinacoes WHERE id = ?", [id]);
    const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
    io.emit("update", lista);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Rota: editar combinação (ADMIN) ---
app.put("/combinacoes/:id", async (req, res) => {
  const { adminPassword, nome, n1, n2, n3 } = req.body;
  const { id } = req.params;
  if (adminPassword !== ADMIN_PASSWORD)
    return res.status(401).send("Senha inválida");
  try {
    const nomeFormatado = toTitleCase(nome.trim());
    await db.run(
      "UPDATE combinacoes SET nome = ?, n1 = ?, n2 = ?, n3 = ? WHERE id = ?",
      [nomeFormatado, n1, n2, n3, id]
    );
    const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
    io.emit("update", lista);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Rota: LIMPAR TODA A LISTA (ADMIN) ---
app.delete("/combinacoes/all", async (req, res) => {
  const { adminPassword } = req.body;
  if (adminPassword !== ADMIN_PASSWORD)
    return res.status(401).send("Senha inválida");
  try {
    await db.run("DELETE FROM combinacoes");
    io.emit("update", []);
    res.json({ success: true, message: "Lista limpa." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- NOVA ROTA: MUDAR STATUS (ADMIN) ---
app.post("/toggle-status", (req, res) => {
  const { adminPassword } = req.body;
  if (adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).send("Senha de admin inválida");
  }

  // Inverte o estado
  isListOpen = !isListOpen;
  const newStatus = isListOpen ? "open" : "closed";

  // Avisa todos os clientes conectados sobre a mudança
  io.emit("statusUpdate", newStatus);
  console.log(`Lista agora está: ${newStatus}`);
  res.json({ success: true, status: newStatus });
});
// --- FIM DA NOVA ROTA ---

// --- Socket.io: conexão em tempo real ---
io.on("connection", async (socket) => {
  console.log("🟢 Usuário conectado:", socket.id);

  // 1. Envia a lista atual
  const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
  socket.emit("update", lista);

  // --- MUDANÇA: Envia o status atual SÓ para este usuário ---
  const currentStatus = isListOpen ? "open" : "closed";
  socket.emit("statusUpdate", currentStatus);
  // --- FIM DA MUDANÇA ---
});

// --- Iniciar o servidor ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
