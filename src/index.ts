import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { socketAuthMiddleware } from './middleware/socket-auth';
import { setupChannelHandlers } from './socket/channel-handlers';
import { setupDirectMessageHandlers } from './socket/dm-handlers';
import { errorHandler } from './middleware/error-handlers';


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

export const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO middleware
io.use(socketAuthMiddleware);

// Create separate namespaces for channels and DMs
const channelNamespace = io.of('/channels');
const dmNamespace = io.of('/dms');

// Setup socket handlers
setupChannelHandlers(channelNamespace);
setupDirectMessageHandlers(dmNamespace);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});