const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const cors = require("cors");
const Groq = require("groq-sdk");
require("dotenv").config();

// Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Express app and config
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, "data", "students.json");

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// ================= HELPERS =================
async function readStudents() {
  try {
    const content = await fs.readFile(DATA_PATH, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error reading students.json:", err);
    return [];
  }
}

async function writeStudents(arr) {
  await fs.writeFile(DATA_PATH, JSON.stringify(arr, null, 2), "utf8");
}

// ================= CRUD ROUTES =================
app.get("/students", async (req, res) => {
  const students = await readStudents();
  res.json(students);
});

app.post("/students", async (req, res) => {
  const {
    "Student ID": StudentID,
    "Full Name": FullName,
    Gender,
    Gmail,
    Program,
    "Year Level": YearLevel,
    University,
  } = req.body;

  if (
    !StudentID ||
    !FullName ||
    !Gender ||
    !Gmail ||
    !Program ||
    YearLevel === undefined ||
    !University
  ) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const students = await readStudents();

  if (students.some((s) => s["Student ID"] === StudentID)) {
    return res.status(409).json({ error: "Student ID already exists." });
  }

  const newStudent = {
    "Student ID": StudentID,
    "Full Name": FullName,
    Gender,
    Gmail,
    Program,
    "Year Level": YearLevel,
    University,
  };

  students.push(newStudent);
  await writeStudents(students);
  res.status(201).json(newStudent);
});

app.delete("/students/:id", async (req, res) => {
  const id = req.params.id;
  const students = await readStudents();
  const index = students.findIndex((s) => s["Student ID"] === id);

  if (index === -1) {
    return res.status(404).json({ error: "Student not found." });
  }

  const removed = students.splice(index, 1)[0];
  await writeStudents(students);
  res.json({ success: true, removed });
});

// ================= LLM / QUERY ROUTE =================
app.post("/api/llm-chat", async (req, res) => {
  const { message } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({
      question: message || "",
      answer: null,
      error: "Question cannot be empty.",
    });
  }

  const students = await readStudents();
  const q = message.toLowerCase();

  if (!students.length) {
    return res.json({
      question: message,
      answer: "The student dataset is empty.",
      error: null,
    });
  }

  // STRICT NAME-ONLY MODE (NO LLM)
  if (
    (q.includes("name only") || q.includes("names only")) &&
    (q.includes("bsit") || q.includes("information technology"))
  ) {
    const bsitStudents = students.filter(
      (s) => s.Program === "BS Information Technology"
    );

    if (!bsitStudents.length) {
      return res.json({
        question: message,
        answer: "No BSIT students were found in the records.",
        error: null,
      });
    }

    const names = bsitStudents.map((s) => s["Full Name"]);

    return res.json({
      question: message,
      answer: names.join("\n"),
      error: null,
    });
  }

  // COUNT QUESTIONS (DETERMINISTIC)
  if (q.includes("how many") || q.includes("count")) {
    let filtered = [...students];

    if (q.includes("bsit")) {
      filtered = filtered.filter(
        (s) => s.Program === "BS Information Technology"
      );
    }

    if (q.includes("male")) {
      filtered = filtered.filter(
        (s) => s.Gender.toLowerCase() === "male"
      );
    }

    if (q.includes("female")) {
      filtered = filtered.filter(
        (s) => s.Gender.toLowerCase() === "female"
      );
    }

    if (q.includes("3rd") || q.includes("third")) {
      filtered = filtered.filter((s) =>
        String(s["Year Level"]).includes("3")
      );
    }

    return res.json({
      question: message,
      answer: `There are ${filtered.length} matching students in the records.`,
      error: null,
    });
  }

  // LIST QUESTIONS (DETERMINISTIC)
  if (q.includes("list") || q.includes("show")) {
    let filtered = [...students];

    if (q.includes("bsit")) {
      filtered = filtered.filter(
        (s) => s.Program === "BS Information Technology"
      );
    }

    if (!filtered.length) {
      return res.json({
        question: message,
        answer: "No matching students were found in the records.",
        error: null,
      });
    }

    const lines = filtered.map(
      (s) => `- ${s["Full Name"]} – ${s.Program}, ${s["Year Level"]}`
    );

    return res.json({
      question: message,
      answer: lines.join("\n"),
      error: null,
    });
  }

  // SUMMARY (DETERMINISTIC)
  if (q.includes("summary") || q.includes("program")) {
    const counts = {};
    students.forEach((s) => {
      counts[s.Program] = (counts[s.Program] || 0) + 1;
    });

    const lines = Object.entries(counts).map(
      ([prog, count]) => `- ${prog}: ${count} student(s)`
    );

    return res.json({
      question: message,
      answer:
        `There are ${students.length} students in total.\n\nStudents per Program:\n` +
        lines.join("\n"),
      error: null,
    });
  }

  // OPTIONAL LLM (NON-DATA QUESTIONS ONLY)
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You are an academic assistant. If the question cannot be answered using student records, say so clearly.",
        },
        { role: "user", content: message },
      ],
      temperature: 0,
      max_tokens: 80,
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I cannot answer that.";

    return res.json({ question: message, answer, error: null });
  } catch (err) {
    console.error("LLM error:", err.message);
    return res.status(503).json({
      question: message,
      answer: null,
      error: "AI service unavailable.",
    });
  }
});

// ================= FALLBACK =================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// START SERVER (Render uses process.env.PORT)
app.listen(PORT, () => {
  console.log(`SIMS server running at http://localhost:${PORT}`);
});
