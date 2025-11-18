import React, { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase";
import axios from "axios";

export default function Register({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("client"); // client | provider
  const [msg, setMsg] = useState("");

  const backendBase = "http://localhost:5000"; // zmień na produkcyjny URL po deployu

  const handleRegister = async (e) => {
    e.preventDefault();
    setMsg("Rejestruję...");

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // update displayName
      await updateProfile(userCredential.user, { displayName: name });

      // pobierz token firebase id
      const token = await userCredential.user.getIdToken();

      // wyślij do backendu, żeby utworzyć rekord w PostgreSQL
      const resp = await axios.post(
        `${backendBase}/api/auth/register`,
        { email, name, role },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setMsg("Zarejestrowano: " + (resp.data?.message || "OK"));
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      setMsg("Błąd: " + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div style={{ maxWidth: 420 }}>
      <h2>Register</h2>
      <form onSubmit={handleRegister}>
        <div><input placeholder="Imię i nazwisko" value={name} onChange={e => setName(e.target.value)} required /></div>
        <div><input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div><input type="password" placeholder="Hasło" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        <div>
          <label>
            <input type="radio" name="role" value="client" checked={role==="client"} onChange={()=>setRole("client")} /> Klient
          </label>{" "}
          <label>
            <input type="radio" name="role" value="provider" checked={role==="provider"} onChange={()=>setRole("provider")} /> Właściciel sal.
          </label>
        </div>
        <button type="submit">Zarejestruj</button>
      </form>
      <p>{msg}</p>
    </div>
  );
}
