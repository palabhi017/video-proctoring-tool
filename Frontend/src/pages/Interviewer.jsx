import { useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
import VideoProctor from "../componets/VideoProctor";
import socket from "../socket";
import EventLog from "../componets/EventLog";

export default function Interviewer() {
  const [sessionId, setSessionId] = useState("");
  const [name, setName] = useState("Interviewer");
  const [remoteStream, setRemoteStream] = useState(null);
  const [events, setEvents] = useState([]);
  const peerRef = useRef(null);

  useEffect(() => {
    socket.connect();
    socket.on("connect", () =>
      console.log("socket connected interviewer", socket.id)
    );
    socket.on("signal", ({ from, data }) => {
      if (peerRef.current) peerRef.current.signal(data);
    });

    socket.on("participant-joined", (info) => {
      console.log("participant joined", info);
    });

    socket.on("detection-event", (ev) => {
      setEvents((s) => [ev, ...s]);
    });

    return () => {
      socket.off("connect");
      socket.off("signal");
      socket.off("participant-joined");
      socket.off("detection-event");
    };
  }, []);

  const join = () => {
    if (!sessionId) return alert("Enter session id");
    socket.emit("join-session", { sessionId, role: "interviewer", name });

    // create peer as non-initiator
    const p = new Peer({ initiator: false, trickle: false, stream: null });
    peerRef.current = p;

    p.on("signal", (data) => {
      // send answer back
      socket.emit("signal", { sessionId, data });
    });

    p.on("stream", (stream) => {
      setRemoteStream(stream);
    });

    p.on("error", (err) => console.warn("peer error", err));
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Interviewer</h2>
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
        <button onClick={join} style={{ marginLeft: 8 }}>
          Join
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <div style={{ width: 640 }}>
          <h4>Live Candidate Stream</h4>
          <VideoProctor stream={remoteStream} muted={false} />
        </div>

        <div style={{ flex: 1 }}>
          <h4>Live Events</h4>
          <EventLog events={events} />
          <div style={{ marginTop: 8 }}>
            <button
              onClick={async () => {
                const resp = await fetch(
                  `${process.env.REACT_APP_BACKEND_URL}/api/report/${sessionId}`
                );
                const data = await resp.json();
                console.log("report", data);
                alert("Report fetched. Check console.");
              }}
            >
              Fetch Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
