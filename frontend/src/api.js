// api.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:4000/api/chat', 
});

export const createOrGetChat = (userId1, userId2) => {
  return api.post('/create-or-get', { userId1, userId2 });
};

export const getInbox = (userId) => {
  return api.get(`/inbox/${userId}`);
};