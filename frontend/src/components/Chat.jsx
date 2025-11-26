import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import './Chat.css';

const SOCKET_URL = 'http://localhost:4000'; // adjust if needed
const API_BASE = 'http://localhost:4000/api/chat';

export default function Chat({ chatId, userId, onLeave }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const fileInputRef = useRef();
  const socketRef = useRef();
  const messagesEndRef = useRef();
  const messagesContainerRef = useRef();

  // ────────────────────────────── Socket & Initial Load ──────────────────────────────
  useEffect(() => {
    socketRef.current = io(SOCKET_URL);
    socketRef.current.emit('join-chat', chatId);

    // Listen for incoming messages
    socketRef.current.on('message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    // Load first page
    loadMessages(1, true);

    return () => {
      socketRef.current?.emit('leave-chat', chatId);
      socketRef.current?.disconnect();
    };
  }, [chatId]);

  // ────────────────────────────── Load Messages (with pagination) ──────────────────────────────
  const loadMessages = async (pageNum = 1, reset = false) => {
    if (loading || (!hasMore && !reset)) return;
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/${chatId}?page=${pageNum}&limit=30`);
      const data = await res.json();

      if (data.success) {
        const newMsgs = data.messages;
        setMessages(prev => reset ? newMsgs : [...newMsgs, ...prev]);
        setHasMore(data.pagination?.hasMore ?? false);
        setPage(pageNum);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  // ────────────────────────────── Infinite Scroll ──────────────────────────────
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || loading || !hasMore) return;

    // When user scrolls to top → load older messages
    if (container.scrollTop < 100) {
      loadMessages(page + 1, false);
    }
  }, [page, loading, hasMore]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) container.addEventListener('scroll', handleScroll);
    return () => container?.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // ────────────────────────────── Auto-scroll to bottom on new message ──────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ────────────────────────────── Send Message ──────────────────────────────
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !selectedImage) return;

    const formData = new FormData();
    formData.append('chatId', chatId);
    formData.append('senderId', userId);
    if (newMessage.trim()) formData.append('text', newMessage.trim());
    if (selectedImage) formData.append('image', selectedImage);

    try {
      const res = await fetch(`${API_BASE}/send-message`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setNewMessage('');
        setSelectedImage(null);
        fileInputRef.current && (fileInputRef.current.value = '');
      } else {
        const err = await res.json();
        alert('Failed to send: ' + (err.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Send failed:', err);
      alert('Network error');
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) setSelectedImage(file);
  };

  const isOwnMessage = (msg) => msg.sender === userId;

  return (
    <>
      <div className="chat-container">

        <div className="chat-header">
          <h2>Chat</h2>
          <button onClick={onLeave} className="leave-btn">Leave</button>
        </div>

        {/* Messages Container */}
        <div
          ref={messagesContainerRef}
          className="messages-container"
          style={{ overflowY: 'auto', padding: '10px' }}
        >
          {loading && page > 1 && (
            <div style={{ textAlign: 'center', padding: '10px' }}>
              Loading older messages...
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg._id}
              className={`message-wrapper ${isOwnMessage(msg) ? 'own' : 'other'}`}
            >
              <div className={`message-bubble ${isOwnMessage(msg) ? 'own' : 'other'}`}>
                <div className="message-sender">
                  {isOwnMessage(msg) ? 'You' : msg.sender.username || msg.sender._id || msg.sender}
                </div>

                {msg.text && <p className="message-text">{msg.text}</p>}

                {msg.image && (
                  <img
                    src={msg.image}
                    alt="sent"
                    className="message-image"
                    loading="lazy"
                  />
                )}

                <div className="message-time">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Image Preview */}
        {selectedImage && (
          <div className="image-preview">
            <img
              src={URL.createObjectURL(selectedImage)}
              alt="Preview"
              className="preview-img"
            />
            <button onClick={() => {
              setSelectedImage(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }} className="remove-preview-btn">
              Remove
            </button>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={sendMessage} className="message-input-form">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="attach-image-btn"
            title="Attach image"
          >
            Image
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="file-input-hidden"
          />

          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="message-input"
          />

          <button type="submit" className="send-btn" disabled={loading}>
            Send
          </button>
        </form>
      </div>
    </>
  );
}
