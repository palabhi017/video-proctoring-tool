import dotenv from "dotenv";
import express from "express";
import http from "http";
import cors from "cors";
import mongoose from "mongoose";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Mongo

// Mongoose schema
const EventSchema = new mongoose.Schema({
  sessionId: String,
  candidateName: String,
  type: String,
  meta: Object,
  ts: { type: Date, default: Date.now },
});
const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, unique: true },
  candidateName: String,
  interviewerName: String,
  startTime: Date,
  endTime: Date,
  videoUrl: String,
});
const EventModel = mongoose.model("Event", EventSchema);
const SessionModel = mongoose.model("Session", SessionSchema);

// Multer memory storage for uploads
const upload = multer({ storage: multer.memoryStorage() });

// API to upload video to cloudinary
app.post("/api/upload-video", upload.single("video"), (req, res) => {
  const { sessionId } = req.body;
  if (!req.file) return res.status(400).json({ ok: false, message: "No file" });

  const uploadStream = cloudinary.uploader.upload_stream(
    { folder: `proctoring/${sessionId || "unspecified"}` },
    async (error, result) => {
      if (error) {
        console.error("Cloudinary upload error", error);
        return res.status(500).json({ ok: false, error });
      }
      // Save video URL to session
      if (sessionId) {
        await SessionModel.findOneAndUpdate(
          { sessionId },
          { videoUrl: result.secure_url, endTime: new Date() },
          { upsert: true }
        );
      }
      res.json({ ok: true, url: result.secure_url });
    }
  );

  streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
});

// API to get report for a session
app.get("/api/report/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId;
  const events = await EventModel.find({ sessionId }).sort({ ts: 1 }).lean();
  const session = await SessionModel.findOne({ sessionId }).lean();
  res.json({ ok: true, session, events });
});

// Socket.IO signaling & event handling
io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  // join a session room
  socket.on("join-session", async ({ sessionId, role, name }) => {
    socket.join(sessionId);
    socket.data.sessionId = sessionId;
    socket.data.role = role;
    socket.data.name = name;

    // if candidate joins, create/update session startTime
    if (role === "candidate") {
      await SessionModel.findOneAndUpdate(
        { sessionId },
        { candidateName: name, startTime: new Date() },
        { upsert: true }
      );
    }
    if (role === "interviewer") {
      await SessionModel.findOneAndUpdate(
        { sessionId },
        { interviewerName: name },
        { upsert: true }
      );
    }

    io.to(sessionId).emit("participant-joined", { sessionId, role, name });
  });

  // relay signaling data (for WebRTC)
  socket.on("signal", ({ sessionId, to, data }) => {
    if (to) {
      io.to(to).emit("signal", { from: socket.id, data });
    } else {
      socket.to(sessionId).emit("signal", { from: socket.id, data });
    }
  });

  // candidate emits detection events -> save and broadcast
  socket.on("detection-event", async ({ sessionId, type, meta, ts }) => {
    const doc = await EventModel.create({
      sessionId,
      candidateName: socket.data.name || meta?.candidateName,
      type,
      meta,
      ts: ts ? new Date(ts) : new Date(),
    });
    io.to(sessionId).emit("detection-event", {
      id: doc._id,
      sessionId,
      type,
      meta,
      ts: doc.ts,
    });
  });

  socket.on("disconnect", () => {
    console.log("socket disconnected", socket.id);
  });
});

// start server
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
  })
  .catch((e) => console.error("Mongo connection error", e));
