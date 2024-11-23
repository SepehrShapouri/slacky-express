import { PrismaClient } from "@prisma/client";
import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { errorHandler } from "./middleware/error-handlers";
import { socketAuthMiddleware } from "./middleware/socket-auth";
import { setupChannelHandlers } from "./socket/channel-handlers";
import { setupConversationHandlers } from "./socket/conversation-handlers";
import { setupThreadHandlers } from "./socket/thread-handlers";
import { setupWorkspaceHandlers } from "./socket/workspace-handler";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin:
      process.env.NODE_ENV == "production"
        ? process.env.CLIENT_URL
        : "http://localhost:3001",
    methods: ["GET", "POST"],
  },
});

export const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

io.use(socketAuthMiddleware);

const channelNamespace = io.of("/channels");
const conversationNamespace = io.of("/conversation");
const workspaceNamespace = io.of("/workspaces");
const threadNamespace = io.of("/threads");
setupChannelHandlers(channelNamespace);
setupConversationHandlers(conversationNamespace);
setupWorkspaceHandlers(workspaceNamespace);
setupThreadHandlers(threadNamespace);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
