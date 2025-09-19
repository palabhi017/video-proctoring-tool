const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export async function uploadVideo(file, sessionId) {
  const form = new FormData();
  form.append("video", file);
  form.append("sessionId", sessionId);
  const resp = await fetch(`${BACKEND}/api/upload-video`, {
    method: "POST",
    body: form,
  });
  return resp.json();
}

export async function fetchReport(sessionId) {
  const resp = await fetch(`${BACKEND}/api/report/${sessionId}`);
  return resp.json();
}
