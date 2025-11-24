// App.jsx (Updated for 3-collection backend)
import React, { useState } from 'react';
import Chat from './components/Chat';
import { createOrGetChat } from './api';
import './App.css';

export default function App() {
  const [me, setMe] = useState('');
  const [peer, setPeer] = useState('');
  const [chat, setChat] = useState(null); // now holds { _id, participants, ... }

  const startChat = async () => {
    if (!me.trim() || !peer.trim()) {
      alert('Please enter both your ID and peer ID');
      return;
    }

    try {
      // API now expects userId1 and userId2 (MongoDB ObjectIds or usernames)
      const res = await createOrGetChat(me.trim(), peer.trim());

      // New response shape: { success: true, chat: { _id, participants: [{_id, username}], ... } }
      if (res.data.success) {
        setChat(res.data.chat); // store just the chat object
      }
    } catch (err) {
      console.error('Failed to start chat:', err);
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const leave = () => {
    setChat(null);
    setMe('');
    setPeer('');
  };

  // ────────────────────────────── Login Screen ──────────────────────────────
  if (!chat) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1 className="login-title">2-Person Chat App</h1>
          <p className="login-subtitle">Enter your ID and your friend's ID</p>

          <div className="input-group">
            <label htmlFor="me">Your ID</label>
            <input
              id="me"
              type="text"
              value={me}
              onChange={(e) => setMe(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="input-group">
            <label htmlFor="peer">Peer ID</label>
            <input
              id="peer"
              type="text"
              value={peer}
              onChange={(e) => setPeer(e.target.value)}
              className="input-field"
            />
          </div>

          <button onClick={startChat} className="start-btn">
            Start Chat
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────── Chat Screen ──────────────────────────────
  return (
    <div className="app-container">
      <Chat 
        chatId={chat._id} 
        userId={me.trim()} 
        onLeave={leave} 
      />
    </div>
  );
}

