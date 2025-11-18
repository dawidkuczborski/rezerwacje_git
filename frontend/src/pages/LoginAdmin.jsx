import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import axios from "axios";

export default function LoginAdmin({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const backendBase = "http://localhost:5000";

  const handleLogin = async (e) => {
    e.preventDefault();
    setMsg("Logowanie...");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const token = await cred.user.getIdToken();

      const resp = await axios.get(`${backendBase}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.data.role !== "provider" && resp.data.role !== "employee") {
        setMsg("❌ To konto nie ma dostępu do panelu!");
        return;
      }

      setMsg("✅ Zalogowano pomyślnie!");
      if (onSuccess) onSuccess(resp.data.role);
    } catch (err) {
      console.error(err);
      setMsg("Błąd logowania: " + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "auto", textAlign: "center" }}>
      <h2>💈 Logowanie właściciela / pracownika</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        /><br />
        <input
          type="password"
          placeholder="Hasło"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        /><br />
        <button type="submit">Zaloguj</button>
      </form>
      <p>{msg}</p>
    </div>
  );
}
