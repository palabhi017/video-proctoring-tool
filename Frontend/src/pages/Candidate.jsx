import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as facemesh from "@tensorflow-models/face-landmarks-detection";
import * as tf from "@tensorflow/tfjs";
import { useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
// import { uploadVideo } from "../api";
import VideoProctor from "../componets/VideoProctor";
import socket from "../socket";

const DETECT_INTERVAL = 400;
const LOOKING_AWAY_SEC = 5;
const FACE_ABSENT_SEC = 10;

export default function Candidate() {
  const [localStream, setLocalStream] = useState(null);
  const [sessionId, setSessionId] = useState("");
  const [name, setName] = useState("Candidate");
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const peerRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const modelsRef = useRef({ face: null, object: null });
  const lastFaceSeenRef = useRef(Date.now());
  const lookingAwayStartRef = useRef(null);

  useEffect(() => {
    socket.connect();
    socket.on("connect", () =>
      console.log("socket connected candidate", socket.id)
    );
    socket.on("signal", ({ from, data }) => {
      if (peerRef.current) peerRef.current.signal(data);
    });

    socket.on("participant-joined", (info) => {
      console.log("participant joined", info);
    });

    return () => {
      socket.off("connect");
      socket.off("signal");
      socket.off("participant-joined");
    };
  }, []);

  useEffect(() => {
    (async () => {
      await tf.ready();
      modelsRef.current.face = await facemesh.load(
        facemesh.SupportedPackages.mediapipeFacemesh
      );
      modelsRef.current.object = await cocoSsd.load();
    })();
  }, []);

  const start = async () => {
    if (!sessionId) return alert("Enter session ID");
    const s = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: true,
    });
    setLocalStream(s);

    socket.emit("join-session", { sessionId, role: "candidate", name });

    const p = new Peer({ initiator: true, trickle: false, stream: s });
    peerRef.current = p;

    p.on("signal", (data) => {
      socket.emit("signal", { sessionId, data });
    });

    p.on("connect", () => {
      console.log("peer connected");
      setConnected(true);
    });

    p.on("error", (err) => console.warn("peer error", err));

    recorderRef.current = new MediaRecorder(s, {
      mimeType: "video/webm; codecs=vp8,opus",
    });
    recorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current.start(1000);

    detectionLoop(s);

    socket.on("signal", ({ data }) => {
      p.signal(data);
    });
  };

  const detectionLoop = async (stream) => {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 500));

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    while (true) {
      if (!modelsRef.current.face || !modelsRef.current.object) {
        await new Promise((r) => setTimeout(r, DETECT_INTERVAL));
        continue;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const faces = await modelsRef.current.face.estimateFaces({
          input: video,
          returnTensors: false,
          predictIrises: false,
        });
        if (!faces || faces.length === 0) {
          const now = Date.now();
          if (now - lastFaceSeenRef.current > FACE_ABSENT_SEC * 1000) {
            emitEvent("face_absent", {
              detail: `No face for > ${FACE_ABSENT_SEC}s`,
            });
            lastFaceSeenRef.current = Date.now();
          }
          lookingAwayStartRef.current = null;
        } else {
          lastFaceSeenRef.current = Date.now();
          if (faces.length > 1)
            emitEvent("multiple_faces", { count: faces.length });

          const primary = faces[0];
          const box = primary.boundingBox;
          if (box) {
            const tl = box.topLeft;
            const br = box.bottomRight;
            const centerX = (tl[0] + br[0]) / 2;
            let noseX = null;
            if (primary.annotations && primary.annotations.noseTip)
              noseX = primary.annotations.noseTip[0][0];
            else if (primary.scaledMesh && primary.scaledMesh[1])
              noseX = primary.scaledMesh[1][0];

            if (noseX !== null) {
              const offset = (noseX - centerX) / (br[0] - tl[0]);
              if (Math.abs(offset) > 0.25) {
                if (!lookingAwayStartRef.current)
                  lookingAwayStartRef.current = Date.now();
                const dur =
                  (Date.now() - (lookingAwayStartRef.current || Date.now())) /
                  1000;
                if (dur > LOOKING_AWAY_SEC) {
                  emitEvent("looking_away", {
                    detail: `Looking away for > ${LOOKING_AWAY_SEC}s`,
                  });
                  lookingAwayStartRef.current = null;
                }
              } else {
                lookingAwayStartRef.current = null;
              }
            }
          }
        }
      } catch (err) {
        console.warn("face detect err", err);
      }

      try {
        const predictions = await modelsRef.current.object.detect(video);
        predictions.forEach((p) => {
          const klass = p.class;
          if (
            ["cell phone", "book", "laptop", "tablet", "handbag"].includes(
              klass
            )
          ) {
            emitEvent(klass, { score: p.score, bbox: p.bbox });
          }
        });
      } catch (e) {}

      await new Promise((r) => setTimeout(r, DETECT_INTERVAL));
    }
  };

  function emitEvent(type, meta) {
    const ev = { sessionId, type, meta, ts: new Date().toISOString() };
    setEvents((s) => [ev, ...s]);
    socket.emit("detection-event", ev);
  }

  const stop = async () => {
    // localStream?.getTracks().forEach((t) => t.stop());
    // recorderRef.current?.stop();
    // const blob = new Blob(chunksRef.current, { type: "video/webm" });
    // const file = new File([blob], `recording_${sessionId}_${Date.now()}.webm`, {
    //   type: "video/webm",
    // });
    // const res = await uploadVideo(file, sessionId);
    // console.log("upload result", res);
    // alert(
    //   "Recording uploaded. Video URL: " + (res.url || res?.result?.secure_url)
    // );
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Candidate</h2>
      <div>
        <label>
          Session ID:{" "}
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          />
        </label>
        <label style={{ marginLeft: 8 }}>
          Name: <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button onClick={start} style={{ marginLeft: 8 }}>
          Start
        </button>
        <button onClick={stop} style={{ marginLeft: 8 }}>
          Stop & Upload
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <div style={{ width: 640 }}>
          <h4>Local Preview</h4>
          <VideoProctor stream={localStream} muted />
        </div>

        {/* <div style={{ flex: 1 }}>
          <h4>Events (live)</h4>
          <EventLog events={events} />
        </div> */}
      </div>
    </div>
  );
}
