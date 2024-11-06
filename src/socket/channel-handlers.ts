import { Namespace, Socket } from "socket.io";
import { prisma } from "../index";
import { SocketError } from "../utils/errors";
import { Message } from "../utils/types";
import { Messages } from "@prisma/client";

export function setupChannelHandlers(io: Namespace) {
  io.on("connection", (socket: Socket) => {
    console.log("Client connected to channel namespace");

    socket.on("join-room", (channelId: string,memberId) => {
      socket.join(channelId);
    });

    socket.on("send-message", async (message: Message) => {
      try {
        const workspace = await prisma.workspaces.findUnique({
          where: {
            id: message.workspaceId,
          },
        });
        if (!workspace) {
          socket.emit("error", new SocketError("This workspace doesnt exist"));
          return;
        }
        const member = await prisma.member.findUnique({
          where: {
            userId_workspaceId: {
              workspaceId: message.workspaceId,
              userId: message.userId,
            },
          },
        });
        if (!member) {
          socket.emit("error", new SocketError("Unauthorized"));
        }
        console.log(message);
        const savedMessage = await prisma.messages.create({
          data: {
            body: message.body,
            memberId: message.memberId,
            workspaceId: message.workspaceId,
            channelId: message.channelId,
            attachments: message.attachments,
            reactions: undefined,
          },
          include: {
            member: {
              include: {
                user: {
                  select: {
                    avatarUrl: true,
                    fullname: true,
                    email: true,
                  },
                },
              },
            },
          },
        });

        io.to(message.channelId).emit("new-message", {
          ...savedMessage,
          key: message.key,
        });
      } catch (error) {
        socket.emit("error", new SocketError("Failed to save message"));
      }
    });
    socket.on("edit-message", async (editedMessage: Messages) => {
      try {
        const updatedMessage = await prisma.messages.update({
          where: {
            id: editedMessage.id,
          },
          data: {
            body: editedMessage.body,
            updatedAt: new Date(),
          },
           include: {
            member: {
              include: {
                user: {
                  select: {
                    avatarUrl: true,
                    fullname: true,
                    email: true,
                  },
                },
              },
            },
          },
        });
        io.to(editedMessage.channelId!).emit("message-updated", updatedMessage);
      } catch (error) {
        socket.emit("error", new SocketError("Failed to edit message"));
      }
    });

    socket.on(
      "delete-message",
      async (messageId: string, channelId?: string) => {
        try {
          const deletedMessage = await prisma.messages.delete({
            where: { id: messageId },
          });

          io.to(channelId!).emit(
            "message-deleted",
            messageId,
            deletedMessage.memberId
          );
        } catch (error) {
          socket.emit("error", new SocketError("Failed to delete message"));
        }
      }
    );
    socket.on("disconnect", () => {
      console.log("Client disconnected from channel namespace");
    });
  });
}
