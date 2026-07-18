const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e7 // 10MB file limit
});

const JWT_SECRET = 'tarzanalwaqdiy_premium_wa_key_2026';
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(cors());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://placehold.co"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"]
    }
  }
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: 'طلبات مفرطة، يرجى المحاولة لاحقاً.' }
});
app.use('/api/', apiLimiter);

const users = new Map(); // userId -> userData
const messages = []; // Array of premium messages
const groups = new Map(); // groupId -> groupData
const statuses = []; // Array of statuses
const pinnedChats = new Map(); // userId -> Set of pinned targetIds (userIds/groupIds)

const findUserByUsername = (username) => {
  for (const user of users.values()) {
    if (user.username.toLowerCase() === username.toLowerCase()) return user;
  }
  return null;
};

app.get('/manifest.json', (req, res) => {
  res.json({
    "short_name": "Tarzanalwaqdiy",
    "name": "Tarzanalwaqdiy WhatsApp Premium",
    "icons": [
      {
        "src": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='192' height='192' viewBox='0 0 192 192'><rect width='192' height='192' rx='42' fill='%2300a884'/><path d='M96 35c-33.7 0-61 27.3-61 61 0 10.8 2.8 21 7.7 29.8L35 157l32.2-7.5c8.5 4.6 18.1 7.2 28.8 7.2 33.7 0 61-27.3 61-61s-27.3-61-61-61zm0 109.8c-9.5 0-18.7-2.5-26.8-7.2l-1.9-1.1-19.9 4.6 4.7-19.1-1.3-2c-5.1-8.1-7.8-17.5-7.8-27.2 0-29.3 23.8-53 53-53s53 23.8 53 53-23.8 53-53 53z' fill='white'/></svg>",
        "type": "image/svg+xml",
        "sizes": "192x192"
      }
    ],
    "start_url": "/",
    "background_color": "#0b141a",
    "theme_color": "#00a884",
    "display": "standalone",
    "orientation": "portrait"
  });
});

app.get('/service-worker.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    const CACHE_NAME = 'tarzanalwaqdiy-premium-v2';
    self.addEventListener('install', (e) => {
      e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/manifest.json'])));
    });
    self.addEventListener('fetch', (e) => {
      e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
    });
  `);
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, displayName, password } = req.body;
    if (!username || !displayName || !password) {
      return res.status(400).json({ error: 'يرجى إدخال جميع البيانات المطلوبة.' });
    }
    if (findUserByUsername(username)) {
      return res.status(400).json({ error: 'اسم المستخدم مسجل بالفعل.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'u_' + Math.random().toString(36).substr(2, 9);
    
    const newUser = {
      id: userId,
      username,
      displayName,
      passwordHash,
      avatar: `https://placehold.co/150/00a884/ffffff?text=${encodeURIComponent(displayName.charAt(0).toUpperCase())}`,
      bio: 'متوفر في تطبيق Tarzanalwaqdiy!',
      status: 'online',
      lastSeen: new Date()
    };

    users.set(userId, newUser);
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15d' });

    res.status(201).json({ token, user: { id: userId, username, displayName, avatar: newUser.avatar, bio: newUser.bio } });
  } catch (err) {
    res.status(500).json({ error: 'حدث خطأ في النظام أثناء التسجيل.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور.' });
    }

    const user = findUserByUsername(username);
    if (!user) {
      return res.status(400).json({ error: 'خطأ في اسم المستخدم أو كلمة المرور.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'خطأ في اسم المستخدم أو كلمة المرور.' });
    }

    user.status = 'online';
    user.lastSeen = new Date();

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '15d' });
    res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar, bio: user.bio } });
  } catch (err) {
    res.status(500).json({ error: 'حدث خطأ في النظام أثناء تسجيل الدخول.' });
  }
});

app.get('/api/users/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'غير مصرح.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.get(decoded.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });
    res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar, bio: user.bio } });
  } catch (err) {
    res.status(401).json({ error: 'جلسة منتهية الصلاحية.' });
  }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/manifest.json' || req.path === '/service-worker.js') {
    return next();
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

const activeConnections = new Map(); // userId -> socketId

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const currentUserId = socket.userId;
  activeConnections.set(currentUserId, socket.id);

  const currentUser = users.get(currentUserId);
  if (currentUser) {
    currentUser.status = 'online';
    io.emit('user-status-changed', { userId: currentUserId, status: 'online' });
  }

  socket.join(`user_${currentUserId}`);

  // Sync state helpers
  const emitUsersSync = () => {
    const userList = Array.from(users.values()).map(u => ({
      id: u.id,
      displayName: u.displayName,
      username: u.username,
      avatar: u.avatar,
      bio: u.bio,
      status: u.status,
      lastSeen: u.lastSeen
    }));
    socket.emit('sync-users', userList);
  };

  emitUsersSync();

  const syncAndSendGroups = () => {
    const groupList = Array.from(groups.values()).filter(g => g.members.includes(currentUserId));
    socket.emit('sync-groups', groupList);
  };
  syncAndSendGroups();

  const syncMessages = () => {
    const initialMsgs = messages.filter(m => m.senderId === currentUserId || m.receiverId === currentUserId || (m.groupId && groups.get(m.groupId)?.members.includes(currentUserId)));
    socket.emit('sync-messages', initialMsgs);
  };
  syncMessages();

  const syncStatuses = () => {
    const validStatuses = statuses.filter(s => (new Date() - new Date(s.timestamp)) < 24 * 60 * 60 * 1000);
    socket.emit('sync-statuses', validStatuses);
  };
  syncStatuses();

  // Send user's pins
  const pins = pinnedChats.get(currentUserId) || new Set();
  socket.emit('sync-pins', Array.from(pins));

  socket.on('send-message', (msgData) => {
    const messageId = 'm_' + Math.random().toString(36).substr(2, 9);
    const newMsg = {
      id: messageId,
      senderId: currentUserId,
      receiverId: msgData.receiverId || null,
      groupId: msgData.groupId || null,
      content: msgData.content,
      type: msgData.type || 'text',
      fileName: msgData.fileName || null,
      replyTo: msgData.replyTo || null,
      timestamp: new Date(),
      status: 'delivered', // Standard mock WhatsApp tick transition
      edited: false
    };

    messages.push(newMsg);

    if (newMsg.groupId) {
      io.to(`group_${newMsg.groupId}`).emit('new-message', newMsg);
    } else if (newMsg.receiverId) {
      io.to(`user_${newMsg.receiverId}`).emit('new-message', newMsg);
      socket.emit('new-message', newMsg);
    }
  });

  socket.on('mark-as-read', (data) => {
    // data: { senderId }
    messages.forEach(m => {
      if (!m.groupId && m.senderId === data.senderId && m.receiverId === currentUserId && m.status !== 'read') {
        m.status = 'read';
        io.to(`user_${data.senderId}`).emit('message-status-updated', { messageId: m.id, status: 'read' });
      }
    });
  });

  socket.on('toggle-pin-chat', (targetId) => {
    if (!pinnedChats.has(currentUserId)) {
      pinnedChats.set(currentUserId, new Set());
    }
    const userPins = pinnedChats.get(currentUserId);
    if (userPins.has(targetId)) {
      userPins.delete(targetId);
    } else {
      userPins.add(targetId);
    }
    socket.emit('sync-pins', Array.from(userPins));
  });

  socket.on('edit-message', (data) => {
    const msg = messages.find(m => m.id === data.messageId && m.senderId === currentUserId);
    if (msg) {
      msg.content = data.content;
      msg.edited = true;
      if (msg.groupId) {
        io.to(`group_${msg.groupId}`).emit('message-edited', msg);
      } else {
        io.to(`user_${msg.receiverId}`).emit('message-edited', msg);
        socket.emit('message-edited', msg);
      }
    }
  });

  socket.on('delete-message', (data) => {
    const index = messages.findIndex(m => m.id === data.messageId && m.senderId === currentUserId);
    if (index !== -1) {
      const msg = messages[index];
      if (data.forEveryone) {
        msg.content = 'تم حذف هذه الرسالة';
        msg.type = 'text';
        msg.deletedForEveryone = true;
        if (msg.groupId) {
          io.to(`group_${msg.groupId}`).emit('message-deleted', { messageId: msg.id, forEveryone: true, updatedMsg: msg });
        } else {
          io.to(`user_${msg.receiverId}`).emit('message-deleted', { messageId: msg.id, forEveryone: true, updatedMsg: msg });
          socket.emit('message-deleted', { messageId: msg.id, forEveryone: true, updatedMsg: msg });
        }
      } else {
        socket.emit('message-deleted', { messageId: msg.id, forEveryone: false });
      }
    }
  });

  socket.on('create-group', (data, callback) => {
    const groupId = 'g_' + Math.random().toString(36).substr(2, 9);
    const inviteToken = Math.random().toString(36).substr(2, 12);
    const newGroup = {
      id: groupId,
      name: data.name,
      avatar: data.avatar || `https://placehold.co/150/00a884/ffffff?text=${encodeURIComponent(data.name.charAt(0).toUpperCase())}`,
      ownerId: currentUserId,
      admins: [currentUserId],
      members: [currentUserId, ...(data.members || [])],
      inviteToken
    };

    groups.set(groupId, newGroup);

    newGroup.members.forEach(mId => {
      const mSocketId = activeConnections.get(mId);
      if (mSocketId) {
        io.sockets.sockets.get(mSocketId)?.join(`group_${groupId}`);
      }
      io.to(`user_${mId}`).emit('sync-groups', Array.from(groups.values()).filter(g => g.members.includes(mId)));
    });

    callback({ success: true, group: newGroup });
  });

  socket.on('join-group-by-link', (inviteToken, callback) => {
    let targetGroup = null;
    for (const g of groups.values()) {
      if (g.inviteToken === inviteToken) {
        targetGroup = g;
        break;
      }
    }

    if (!targetGroup) {
      return callback({ success: false, error: 'رابط الدعوة هذا منتهي أو غير صالح.' });
    }

    if (targetGroup.members.includes(currentUserId)) {
      return callback({ success: true, group: targetGroup, alreadyMember: true });
    }

    targetGroup.members.push(currentUserId);
    socket.join(`group_${targetGroup.id}`);

    io.to(`group_${targetGroup.id}`).emit('group-updated', targetGroup);
    
    const sysMsg = {
      id: 'sys_' + Math.random().toString(36).substr(2, 9),
      senderId: 'system',
      groupId: targetGroup.id,
      content: `انضم ${currentUser?.displayName || 'مستخدم جديد'} باستخدام الرابط.`,
      type: 'text',
      timestamp: new Date()
    };
    messages.push(sysMsg);
    io.to(`group_${targetGroup.id}`).emit('new-message', sysMsg);

    callback({ success: true, group: targetGroup });
  });

  socket.on('update-profile', (data) => {
    const user = users.get(currentUserId);
    if (user) {
      if (data.displayName) user.displayName = data.displayName;
      if (data.bio) user.bio = data.bio;
      if (data.avatar) user.avatar = data.avatar;
      
      io.emit('user-profile-updated', {
        id: user.id,
        displayName: user.displayName,
        bio: user.bio,
        avatar: user.avatar
      });
    }
  });

  socket.on('change-password', async (data, callback) => {
    const user = users.get(currentUserId);
    if (user) {
      const isMatch = await bcrypt.compare(data.oldPassword, user.passwordHash);
      if (!isMatch) return callback({ success: false, error: 'كلمة المرور القديمة غير صحيحة.' });
      user.passwordHash = await bcrypt.hash(data.newPassword, 10);
      callback({ success: true });
    }
  });

  socket.on('delete-account', (callback) => {
    const user = users.get(currentUserId);
    if (user) {
      users.delete(currentUserId);
      for (const [gId, gData] of groups.entries()) {
        if (gData.members.includes(currentUserId)) {
          gData.members = gData.members.filter(id => id !== currentUserId);
          io.to(`group_${gId}`).emit('group-updated', gData);
        }
      }
      callback({ success: true });
    }
  });

  socket.on('post-status', (statusData) => {
    const statusId = 's_' + Math.random().toString(36).substr(2, 9);
    const newStatus = {
      id: statusId,
      userId: currentUserId,
      displayName: currentUser.displayName,
      avatar: currentUser.avatar,
      type: statusData.type,
      content: statusData.content,
      timestamp: new Date(),
      views: []
    };

    statuses.push(newStatus);
    io.emit('new-status', newStatus);
  });

  socket.on('view-status', (statusId) => {
    const status = statuses.find(s => s.id === statusId);
    if (status && status.userId !== currentUserId && !status.views.includes(currentUserId)) {
      status.views.push(currentUserId);
      io.emit('status-view-updated', { statusId, views: status.views });
    }
  });

  socket.on('delete-status', (statusId) => {
    const index = statuses.findIndex(s => s.id === statusId && s.userId === currentUserId);
    if (index !== -1) {
      statuses.splice(index, 1);
      io.emit('status-deleted', statusId);
    }
  });

  socket.on('call-user', (data) => {
    const receiverSocketId = activeConnections.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('incoming-call', {
        callerId: currentUserId,
        callerName: currentUser.displayName,
        callerAvatar: currentUser.avatar,
        callType: data.callType
      });
    }
  });

  socket.on('call-response', (data) => {
    const callerSocketId = activeConnections.get(data.callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call-response', {
        receiverId: currentUserId,
        accepted: data.accepted
      });
    }
  });

  socket.on('webrtc-signal', (data) => {
    const targetSocketId = activeConnections.get(data.targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc-signal', {
        senderId: currentUserId,
        signal: data.signal
      });
    }
  });

  socket.on('hangup-call', (data) => {
    const targetSocketId = activeConnections.get(data.targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-hungup');
    }
  });

  socket.on('typing-status', (data) => {
    if (data.isGroup) {
      socket.to(`group_${data.targetId}`).emit('user-activity-indicator', {
        userId: currentUserId,
        groupId: data.targetId,
        action: data.action
      });
    } else {
      io.to(`user_${data.targetId}`).emit('user-activity-indicator', {
        userId: currentUserId,
        action: data.action
      });
    }
  });

  socket.on('disconnect', () => {
    activeConnections.delete(currentUserId);
    const user = users.get(currentUserId);
    if (user) {
      user.status = 'offline';
      user.lastSeen = new Date();
      io.emit('user-status-changed', { userId: currentUserId, status: 'offline', lastSeen: user.lastSeen });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Tarzanalwaqdiy WhatsApp Premium running on http://localhost:${PORT}`);
});
