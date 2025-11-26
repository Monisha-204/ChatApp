import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import './Chat.css';

const SOCKET_URL = 'http://localhost:4000';
const API_BASE = 'http://localhost:4000/api/chat';

export default function Chat({ chatId, userId, onLeave }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');

  const fileInputRef = useRef();
  const socketRef = useRef();
  const messagesEndRef = useRef();
  const messagesContainerRef = useRef();

  // ──────────────────────── UPSERT CURRENT USER ON CHAT OPEN ────────────────────────
  useEffect(() => {
    const registerCurrentUser = async () => {
      try {
        await fetch(`${API_BASE}/upsert-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,                    // this is the ID typed 
            username: userId,                   // fallback: use ID as username (for testing)
            email: `${userId}@temp.com`,        // fake email for dev
            profile: '',                        // optional avatar URL
          }),
        });
        console.log('User registered/updated:', userId);
      } catch (err) {
        console.warn('Failed to upsert user (non-blocking):', err);
      }
    };

    if (userId) {
      registerCurrentUser();
    }
  }, [userId]);

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

    // Listen for message updates
    socketRef.current.on('message-updated', (updatedMessage) => {
      setMessages(prev => prev.map(m => m._id === updatedMessage._id ? updatedMessage : m));
    });

    // Listen for message deletions
    socketRef.current.on('message-deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(m => m._id !== messageId));
    });

    return () => {
      socketRef.current?.emit('leave-chat', chatId);
      socketRef.current?.disconnect();
    };
  }, [chatId]);

  const startEdit = (message) => {
    setEditingMessageId(message._id);
    setEditText(message.text);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  const saveEdit = async (messageId) => {
    if (!editText.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/message/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editText.trim(), userId }),
      });

      if (res.ok) {
        cancelEdit();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to edit');
      }
    } catch (err) {
      alert('Network error');
    }
  };

  const deleteMessage = async (messageId) => {
    if (!confirm('Delete this message?')) return;

    try {
      const res = await fetch(`${API_BASE}/message/${messageId}?userId=${userId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to delete');
      }
    } catch (err) {
      alert('Network error');
    }
  };

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

          {/* {messages.map((msg) => (
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
          ))} */}

          {messages.map((msg) => (
            <div
              key={msg._id}
              className={`message-wrapper ${isOwnMessage(msg) ? 'own' : 'other'}`}
            >
              <div className={`message-bubble ${isOwnMessage(msg) ? 'own' : 'other'}`}>
                <div className="message-sender">
                  {isOwnMessage(msg) ? 'You' : msg.sender.username || msg.sender}
                </div>

                {editingMessageId === msg._id ? (
                  <div className="edit-input-wrapper">
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(msg._id)}
                      autoFocus
                      className="edit-input"
                    />
                    <div className="edit-actions">
                      <button onClick={() => saveEdit(msg._id)} className="save-btn">Save</button>
                      <button onClick={cancelEdit} className="cancel-btn">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {msg.text && <p className="message-text">{msg.text} {msg.edited && <small>(edited)</small>}</p>}

                    {msg.image && (
                      <img src={msg.image} alt="sent" className="message-image" loading="lazy" />
                    )}
                  </>
                )}

                <div className="message-time">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>

                {/* Edit/Delete buttons – only for own messages */}
                {isOwnMessage(msg) && editingMessageId !== msg._id && (
                  <div className="message-actions">
                    <button onClick={() => startEdit(msg)} className="edit-btn" title="Edit">Edit</button>
                    <button onClick={() => deleteMessage(msg._id)} className="delete-btn" title="Delete">Delete</button>
                  </div>
                )}
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
