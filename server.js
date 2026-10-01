const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { connectDB, closeDB } = require("./config/db");

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000" }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ message: "API running" }));

app.use("/api/user", require("./routes/userRoutes"));
// app.use("/api/books", require("./routes/bookRoutes"));
app.use("/api/menu", require("./routes/menuRoutes")); 
const PORT = Number(process.env.PORT || 5000);

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  await closeDB();
  process.exit(0);
});