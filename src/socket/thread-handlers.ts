import { Namespace, Socket } from "socket.io";
import { prisma } from "../index";
import { SocketError } from "../utils/errors";
import { Message } from "../utils/types";
import { Messages } from "@prisma/client";

export function setupThreadHandlers(io: Namespace) {
  io.on("connection", (socket: Socket) => {
    console.log("Client connected to channel namespace");

    socket.on("join-thread", (threadId: string, memberId) => {
      socket.join(threadId);
    console.log('user joined thread',threadId)
    });

    socket.on(
      "send-message",
      async ({
        message,
        parentMessageId,
        threadId,
      }: {
        message: Message;
        parentMessageId: string;
        threadId: string;
      }) => {
        try {
          const workspace = await prisma.workspaces.findUnique({
            where: {
              id: message.workspaceId,
            },
          });
          if (!workspace) {
            socket.emit(
              "error",
              new SocketError("This workspace doesnt exist")
            );
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
          const parentMessage = await prisma.messages.findUnique({
            where: { id: parentMessageId },
          });
          if (!parentMessage) {
            socket.emit("error", new SocketError("Message not found"));
          }

          const savedMessage = await prisma.messages.create({
            data: {
              body: message.body,
              memberId: message.memberId,
              workspaceId: message.workspaceId,
              channelId: message.channelId,
              attachments: message.attachments,
              reactions: undefined,
              parentId: parentMessageId,
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
              reactions: {
                include: {
                  member: {
                    select: {
                      user: {
                        select: {
                          fullname: true,
                          avatarUrl: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });
          if (!savedMessage)
            socket.emit(
              "error",
              new SocketError(
                "Something went wrong whilw replying. Please try again in a bit."
              )
            );


            io.to(threadId).emit("new-message", {
                ...savedMessage,
                key: message.key,
              });
        } catch (error) {
          socket.emit("error", new SocketError("Failed to save message"));
        }
      }
    );

    socket.on("edit-message", async (editedReply: Messages,threadId:string) => {
      try {
        const updatedReply = await prisma.messages.update({
          where: {
            id: editedReply.id,
          },
          data: {
            body: editedReply.body,
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
            reactions: {
              include: {
                member: {
                  select: {
                    user: {
                      select: {
                        fullname: true,
                        avatarUrl: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
        io.to(threadId!).emit("message-updated", updatedReply);
      } catch (error) {
        socket.emit("error", new SocketError("Failed to edit message"));
      }
    });

    socket.on(
      "delete-message",
      async (replyId: string, threadId?: string) => {
        try {
          const deletedMessage = await prisma.messages.delete({
            where: { id: replyId },
          });

          io.to(threadId!).emit(
            "message-deleted",
            replyId,
            deletedMessage.memberId
          );
        } catch (error) {
          socket.emit("error", new SocketError("Failed to delete message"));
        }
      }
    );

    socket.on(
      "reaction",
      async ({
        messageId,
        memberId,
        reaction,
        threadId,
      }: {
        messageId: string;
        memberId: number;
        reaction: string;
        threadId: string;
      }) => {
        try {
          const existingReaction = await prisma.reactions.findUnique({
            where: {
              messageId_memberId_value: {
                memberId,
                messageId,
                value: reaction,
              },
            },
          });
          if (existingReaction) {
            const updatedMessage = await prisma.$transaction(async (tx) => {
              await tx.reactions.delete({
                where: {
                  messageId_memberId_value: {
                    memberId,
                    messageId,
                    value: reaction,
                  },
                },
              });
              const updatedMessage = await tx.messages.findUnique({
                where: {
                  id: messageId,
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
                  reactions: {
                    include: {
                      member: {
                        select: {
                          user: {
                            select: {
                              fullname: true,
                              avatarUrl: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              });
              return updatedMessage;
            });
            io.to(threadId).emit("reaction-added", updatedMessage);
            return;
          }
          const updatedMessage = await prisma.$transaction(async (tx) => {
            await tx.reactions.create({
              data: {
                memberId,
                messageId,
                value: reaction,
              },
            });
            const updatedMessage = await tx.messages.findUnique({
              where: {
                id: messageId,
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
                reactions: {
                  include: {
                    member: {
                      select: {
                        user: {
                          select: {
                            fullname: true,
                            avatarUrl: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            });
            return updatedMessage;
          });

          io.to(threadId).emit("reaction-added", updatedMessage);
        } catch (error) {
          console.log(error);
          socket.emit("error", new SocketError("Failed to add reaction"));
        }
      }
    );

    socket.on("disconnect", () => {
      console.log("Client disconnected from channel namespace");
    });
  });
}
