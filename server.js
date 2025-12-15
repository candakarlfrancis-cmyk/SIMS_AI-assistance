const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const cors = require("cors");
const Groq = require("groq-sdk");
require("dotenv").config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Detect if running on Render
const isRender = process.env.RENDER === "true";

// ✅ Use /tmp for Render (writable), else use /data for local dev
const LOCAL_DATA_PATH = path.join(__dirname, "data", "students.json");
const RENDER_DATA_PATH = path.join("/tmp", "students.json");
const DATA_PATH = isRender ? RENDER_DATA_PATH : LOCAL_DATA_PATH;

// ✅ If running on Render, make sure the JSON file exists in /tmp
(async () => {
  if (isRender) {
    try {
      // Try copying from original data location on first boot
      await fs.copyFile(LOCAL_DATA_PATH, RENDER_DATA_PATH);
      console.log("✅ Copied students.json to /tmp for Render");
    } catch (err) {
      console.log("⚠ No initial students.json copy needed or failed:", err.message);
    }
  }
})();

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// Helper: read students
async function readStudents() {
  try {
    const content = await fs.readFile(DATA_PATH, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error reading students.json:", err);
    return [];
  }
}

// Helper: write students
async function writeStudents(arr) {
  try {
    await fs.writeFile(DATA_PATH, JSON.stringify(arr, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing students.json:", err);
    throw err;
  }
}

/**
 * Routes
 */

// ✅ GET /students
app.get("/students", async (req, res) => {
  const students = await readStudents();
  res.json(students);
});

// ✅ POST /students
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

<<<<<<< HEAD
  if (
    !StudentID ||
    !FullName ||
    !Gender ||
    !Gmail ||
    !Program ||
    YearLevel === undefined ||
    !University
  ) {
=======
  if (!StudentID || !FullName || !Gender || !Gmail || !Program || YearLevel === undefined || !University) {
>>>>>>> a009e6c297aa7270d4de38794fcb749538764fce
    return res.status(400).json({ error: "All fields are required." });
  }

  const students = await readStudents();

<<<<<<< HEAD
  if (students.some((s) => s["Student ID"] === StudentID)) {
=======
  if (students.some(s => s["Student ID"] === StudentID)) {
>>>>>>> a009e6c297aa7270d4de38794fcb749538764fce
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

  try {
    await writeStudents(students);
    res.status(201).json(newStudent);
  } catch (err) {
    res.status(500).json({ error: "Could not save student." });
  }
});

// ✅ DELETE /students/:id
app.delete("/students/:id", async (req, res) => {
  const id = req.params.id;
  const students = await readStudents();
  const index = students.findIndex((s) => s["Student ID"] === id);

  if (index === -1) {
    return res.status(404).json({ error: "Student not found." });
  }

  const removed = students.splice(index, 1)[0];

  try {
    await writeStudents(students);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ error: "Could not delete student." });
  }
});

<<<<<<< HEAD
// POST /api/llm-chat -> ask Groq about students.json
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

  if (!Array.isArray(students) || students.length === 0) {
    return res.status(200).json({
      question: message,
      answer:
        "The student dataset is empty, so there is no data to analyze right now.",
      error: null,
    });
  }

  // Pre-calculate summaries
  const totalStudents = students.length;
  const maleCount = students.filter((s) => s.Gender === "Male").length;
  const femaleCount = students.filter((s) => s.Gender === "Female").length;
  
  const programCounts = {};
  students.forEach((s) => {
    programCounts[s.Program] = (programCounts[s.Program] || 0) + 1;
  });

  const yearLevelCounts = {};
  students.forEach((s) => {
    yearLevelCounts[s["Year Level"]] = (yearLevelCounts[s["Year Level"]] || 0) + 1;
  });

  const systemPrompt =
    "You are a data analyst for a student database. " +
    "For COUNTING questions (how many, total), use the aggregate counts provided. " +
    "For LOOKUP questions (find a student, list students by X), use the student list provided. " +
    "Always use exact numbers and data from what is provided. Do NOT estimate or make up data.";

  // Build compact student list (ID | Name | Gender | Program | Year)
  const studentListText = students
    .map((s) => `${s["Student ID"]} | ${s["Full Name"]} | ${s.Gender} | ${s.Program} | ${s["Year Level"]}`)
    .join("\n");

  const userPrompt =
    `AGGREGATE STATISTICS:\n` +
    `Total Students: ${totalStudents}\n` +
    `Male: ${maleCount}, Female: ${femaleCount}\n\n` +
    `By Program:\n${Object.entries(programCounts)
      .map(([prog, count]) => `${prog}: ${count}`)
      .join("\n")}\n\n` +
    `By Year Level:\n${Object.entries(yearLevelCounts)
      .map(([year, count]) => `${year}: ${count}`)
      .join("\n")}\n\n` +
    `STUDENT LIST (ID | Name | Gender | Program | Year):\n${studentListText}\n\n` +
    `Question: "${message}"\n\n` +
    `Instructions:\n` +
    `- For counts, use the statistics above.\n` +
    `- For lookups, search the student list above.\n` +
    `- Answer with exact data only.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 500,
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I could not generate an answer from the AI service.";

    return res.json({
      question: message,
      answer,
      error: null,
    });
  } catch (err) {
    console.error("LLM error:", err.response?.data || err.message);
    return res.status(503).json({
      question: message,
      answer: null,
      error:
        "The AI service is temporarily unavailable. Please try again later.",
    });
  }
});




// Fallback: serve index.html
=======
// ✅ Serve frontend fallback
>>>>>>> a009e6c297aa7270d4de38794fcb749538764fce
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ SIMS server running on http://localhost:${PORT}`);
  if (isRender) {
    console.log("🚀 Running in Render environment — using /tmp/students.json for write access.");
  }
});
