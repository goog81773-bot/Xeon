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
  maxHttpBufferSize: 1e7 // 10MB limit for attachment previews/uploads
});

const JWT_SECRET = 'tarzanalwaqdiy_super_secret_key_2026';
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Helmet configuration with content security policy updates for inline styles/scripts & web sockets
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://placehold.co"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"]
    }
  }
}));

// Rate limiting to protect against DDoS / brute force
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

const users = new Map(); // userId -> userData
const messages = []; // Array of message objects
const groups = new Map(); // groupId -> groupData
const statuses = []; // Array of status objects

// Helper functions
const findUserByUsername = (username) => {
  for (const user of users.values()) {
    if (user.username.toLowerCase() === username.toLowerCase()) return user;
  }
  return null;
};

app.get('/manifest.json', (req, res) => {
  res.json({
    "short_name": "Tarzanalwaqdiy",
    "name": "Tarzanalwaqdiy Messenger",
    "icons": [
      {
        "src": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='192' height='192' viewBox='0 0 192 192'><rect width='192' height='192' rx='40' fill='%232563EB'/><text x='50%' y='55%' font-family='sans-serif' font-size='80' font-weight='bold' fill='white' text-anchor='middle' dominant-baseline='middle'>T</text></svg>",
        "type": "image/svg+xml",
        "sizes": "192x192"
      },
      {
        "src": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512' viewBox='0 0 512 512'><rect width='512' height='512' rx='110' fill='%232563EB'/><text x='50%' y='55%' font-family='sans-serif' font-size='220' font-weight='bold' fill='white' text-anchor='middle' dominant-baseline='middle'>T</text></svg>",
        "type": "image/svg+xml",
        "sizes": "512x512"
      }
    ],
    "start_url": "/",
    "background_color": "#0F172A",
    "theme_color": "#2563EB",
    "display": "standalone",
    "orientation": "portrait"
  });
});

app.get('/service-worker.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    const CACHE_NAME = 'tarzanalwaqdiy-cache-v1';
    const ASSETS = [
      '/',
      '/manifest.json'
    ];

    self.addEventListener('install', (e) => {
      e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
          return cache.addAll(ASSETS);
        })
      );
    });

    self.addEventListener('fetch', (e) => {
      e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
          return cachedResponse || fetch(e.request);
        })
      );
    });
  `);
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, displayName, password } = req.body;
    if (!username || !displayName || !password) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }
    if (findUserByUsername(username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'u_' + Math.random().toString(36).substr(2, 9);
    
    const newUser = {
      id: userId,
      username,
      displayName,
      passwordHash,
      avatar: `https://placehold.co/150/2563eb/ffffff?text=${displayName.charAt(0).toUpperCase()}`,
      bio: 'أنا أستخدم Tarzanalwaqdiy!',
      status: 'online',
      lastSeen: new Date()
    };

    users.set(userId, newUser);
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user: { id: userId, username, displayName, avatar: newUser.avatar, bio: newUser.bio } });
  } catch (err) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Please enter username and password' });
    }

    const user = findUserByUsername(username);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    user.status = 'online';
    user.lastSeen = new Date();

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar, bio: user.bio } });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.get('/api/users/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.get(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar, bio: user.bio } });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Primary html delivery route
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/manifest.json' || req.path === '/service-worker.js') {
    return next();
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

const activeConnections = new Map(); // userId -> socketId

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error: Token missing'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Authentication error: Token invalid'));
  }
});

io.on('connection', (socket) => {
  const currentUserId = socket.userId;
  activeConnections.set(currentUserId, socket.id);

  // Update status to online
  const currentUser = users.get(currentUserId);
  if (currentUser) {
    currentUser.status = 'online';
    io.emit('user-status-changed', { userId: currentUserId, status: 'online' });
  }

  // Join personal user room
  socket.join(`user_${currentUserId}`);

  // Send list of users & active group objects
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

  const groupList = Array.from(groups.values()).filter(g => g.members.includes(currentUserId));
  socket.emit('sync-groups', groupList);

  const initialMsgs = messages.filter(m => m.senderId === currentUserId || m.receiverId === currentUserId || (m.groupId && groups.get(m.groupId)?.members.includes(currentUserId)));
  socket.emit('sync-messages', initialMsgs);

  const validStatuses = statuses.filter(s => (new Date() - new Date(s.timestamp)) < 24 * 60 * 60 * 1000);
  socket.emit('sync-statuses', validStatuses);

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
      if (!isMatch) {
        return callback({ success: false, error: 'كلمة المرور القديمة غير صحيحة' });
      }
      user.passwordHash = await bcrypt.hash(data.newPassword, 10);
      callback({ success: true });
    } else {
      callback({ success: false, error: 'المستخدم غير موجود' });
    }
  });

  socket.on('delete-account', (callback) => {
    const user = users.get(currentUserId);
    if (user) {
      users.delete(currentUserId);
      // Leave group memberships
      for (const [gId, gData] of groups.entries()) {
        if (gData.members.includes(currentUserId)) {
          gData.members = gData.members.filter(id => id !== currentUserId);
          if (gData.ownerId === currentUserId && gData.members.length > 0) {
            gData.ownerId = gData.members[0];
          }
          io.to(`group_${gId}`).emit('group-updated', gData);
        }
      }
      io.emit('user-account-deleted', currentUserId);
      callback({ success: true });
    } else {
      callback({ success: false, error: 'حدث خطأ ما أثناء محاولة حذف الحساب' });
    }
  });

  socket.on('send-message', (msgData) => {
    const messageId = 'm_' + Math.random().toString(36).substr(2, 9);
    const newMsg = {
      id: messageId,
      senderId: currentUserId,
      receiverId: msgData.receiverId || null,
      groupId: msgData.groupId || null,
      content: msgData.content,
      type: msgData.type || 'text', // text, image, video, file, audio
      fileName: msgData.fileName || null,
      replyTo: msgData.replyTo || null,
      timestamp: new Date(),
      readBy: [currentUserId],
      edited: false
    };

    messages.push(newMsg);

    if (newMsg.groupId) {
      io.to(`group_${newMsg.groupId}`).emit('new-message', newMsg);
    } else if (newMsg.receiverId) {
      io.to(`user_${newMsg.receiverId}`).emit('new-message', newMsg);
      socket.emit('new-message', newMsg); // Echo back to sender
    }
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
        // Just remove from sender view locally via event
        socket.emit('message-deleted', { messageId: msg.id, forEveryone: false });
      }
    }
  });

  socket.on('typing-status', (data) => {
    // data: { targetId, isGroup, action: 'typing' | 'recording' | 'uploading' | 'idle' }
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

  socket.on('create-group', (data, callback) => {
    const groupId = 'g_' + Math.random().toString(36).substr(2, 9);
    const inviteToken = Math.random().toString(36).substr(2, 12);
    const newGroup = {
      id: groupId,
      name: data.name,
      avatar: data.avatar || `https://placehold.co/150/ef4444/ffffff?text=${data.name.charAt(0).toUpperCase()}`,
      ownerId: currentUserId,
      admins: [currentUserId],
      members: [currentUserId, ...(data.members || [])],
      inviteToken
    };

    groups.set(groupId, newGroup);

    // Make all present members join group socket room
    newGroup.members.forEach(mId => {
      const mSocketId = activeConnections.get(mId);
      if (mSocketId) {
        io.sockets.sockets.get(mSocketId)?.join(`group_${groupId}`);
      }
      io.to(`user_${mId}`).emit('sync-groups', [newGroup]);
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
      return callback({ success: false, error: 'رابط الدعوة هذا غير صالح أو منتهي الصلاحية' });
    }

    if (targetGroup.members.includes(currentUserId)) {
      return callback({ success: true, group: targetGroup, alreadyMember: true });
    }

    targetGroup.members.push(currentUserId);
    socket.join(`group_${targetGroup.id}`);

    // Update group layout for everyone
    io.to(`group_${targetGroup.id}`).emit('group-updated', targetGroup);
    
    // Alert members inside group chat
    const sysMsg = {
      id: 'sys_' + Math.random().toString(36).substr(2, 9),
      senderId: 'system',
      groupId: targetGroup.id,
      content: `انضم ${currentUser?.displayName || 'مستخدم جديد'} إلى المجموعة باستخدام رابط الدعوة.`,
      type: 'text',
      timestamp: new Date(),
      readBy: [currentUserId]
    };
    messages.push(sysMsg);
    io.to(`group_${targetGroup.id}`).emit('new-message', sysMsg);

    callback({ success: true, group: targetGroup });
  });

  socket.on('update-group-settings', (data) => {
    const group = groups.get(data.groupId);
    if (group && group.admins.includes(currentUserId)) {
      if (data.name) group.name = data.name;
      if (data.avatar) group.avatar = data.avatar;
      if (data.admins) group.admins = data.admins;
      if (data.members) {
        // Adjust memberships & handle socket joins/leaves
        const oldMembers = [...group.members];
        group.members = data.members;
        
        // Handle leaves
        oldMembers.forEach(mId => {
          if (!group.members.includes(mId)) {
            const mSocketId = activeConnections.get(mId);
            if (mSocketId) io.sockets.sockets.get(mSocketId)?.leave(`group_${group.id}`);
            io.to(`user_${mId}`).emit('group-removed', group.id);
          }
        });

        // Handle joins
        group.members.forEach(mId => {
          if (!oldMembers.includes(mId)) {
            const mSocketId = activeConnections.get(mId);
            if (mSocketId) io.sockets.sockets.get(mSocketId)?.join(`group_${group.id}`);
            io.to(`user_${mId}`).emit('sync-groups', [group]);
          }
        });
      }
      io.to(`group_${group.id}`).emit('group-updated', group);
    }
  });

  socket.on('post-status', (statusData) => {
    const statusId = 's_' + Math.random().toString(36).substr(2, 9);
    const newStatus = {
      id: statusId,
      userId: currentUserId,
      displayName: currentUser.displayName,
      avatar: currentUser.avatar,
      type: statusData.type, // 'text', 'image', 'video'
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
    // data: { receiverId, callType: 'voice' | 'video' }
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
    // data: { callerId, accepted: boolean }
    const callerSocketId = activeConnections.get(data.callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call-response', {
        receiverId: currentUserId,
        accepted: data.accepted
      });
    }
  });

  socket.on('webrtc-signal', (data) => {
    // data: { targetId, signal }
    const targetSocketId = activeConnections.get(data.targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc-signal', {
        senderId: currentUserId,
        signal: data.signal
      });
    }
  });

  socket.on('hangup-call', (data) => {
    // data: { targetId }
    const targetSocketId = activeConnections.get(data.targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-hungup');
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
  console.log(`Tarzanalwaqdiy running on port http://localhost:${PORT}`);
});
