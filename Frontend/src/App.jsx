import React, { useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Candidate from "./pages/Candidate";
import Interviewer from "./pages/Interviewer";
function App() {
  const [name, setName] = useState("");
  const [started, setStarted] = useState(false);

  return (
    <BrowserRouter>
      <div style={{ padding: 12 }}>
        <nav style={{ marginBottom: 12 }}>
          <Link to="/candidate" style={{ marginRight: 8 }}>
            Candidate
          </Link>
          <Link to="/interviewer">Interviewer</Link>
        </nav>

        <Routes>
          <Route path="/candidate" element={<Candidate />} />
          <Route path="/interviewer" element={<Interviewer />} />
          <Route
            path="/"
            element={<div>Select Candidate or Interviewer from nav.</div>}
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
