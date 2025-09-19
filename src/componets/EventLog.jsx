import React from "react";

const EventLog = ({ events }) => {
  console.log(events);
  return (
    <div
      style={{
        maxHeight: 300,
        overflow: "auto",
        border: "1px solid #ddd",
        padding: 8,
      }}
    >
      {events.length === 0 && <div>No events</div>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {events.map((e, i) => (
          <li
            key={i}
            style={{
              marginBottom: 8,
              borderBottom: "1px dashed #eee",
              paddingBottom: 6,
            }}
          >
            <div style={{ fontSize: 12, color: "#555" }}>
              {new Date(e.ts).toLocaleString()}
            </div>
            <div style={{ fontWeight: 600 }}>{e.type}</div>
            {e.meta && (
              <div style={{ fontSize: 13 }}>{JSON.stringify(e.meta)}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default EventLog;
