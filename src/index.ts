import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { socketAuthMiddleware } from './middleware/socket-auth';
import { setupChannelHandlers } from './socket/channel-handlers';
import { setupDirectMessageHandlers } from './socket/dm-handlers';
import { errorHandler } from './middleware/error-handlers';
import { setupWorkspaceHandlers } from './socket/workspace-handler';


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin:process.env.NODE_ENV == 'production' ?  process.env.CLIENT_URL : "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

export const prisma = new PrismaClient();


app.use(cors());
app.use(express.json());


io.use(socketAuthMiddleware);


const channelNamespace = io.of('/channels');
const dmNamespace = io.of('/dms');
const workspaceNamespace = io.of('/workspaces')

setupChannelHandlers(channelNamespace);
setupDirectMessageHandlers(dmNamespace);
setupWorkspaceHandlers(workspaceNamespace)

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});