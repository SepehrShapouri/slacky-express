import { Namespace, Socket } from "socket.io";
import { prisma } from "../index";
import { SocketError } from "../utils/errors";
import { Message } from "../utils/types";
import { Messages } from "@prisma/client";

export function setupConversationHandlers(io: Namespace) {
  io.on("connection", (socket: Socket) => {
    console.log("Client connected to conversation namespace");

    socket.on("join-room", (conversationId: string, memberId) => {
      socket.join(conversationId);
      console.log("user joined conversation",conversationId)
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
        const savedMessage = await prisma.messages.create({
          data: {
            body: message.body,
            memberId: message.memberId,
            workspaceId: message.workspaceId,
            conversationId: message.conversationId,
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

        io.to(message.conversationId!).emit("new-message", {
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
            replies: {
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
                      include: {
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
              orderBy: {
                createdAt: "desc",
              },
            },
          },
        });
        io.to(editedMessage.conversationId!).emit("message-updated", updatedMessage);
      } catch (error) {
        socket.emit("error", new SocketError("Failed to edit message"));
      }
    });
    socket.on(
      "delete-message",
      async (messageId: string, conversationId?: string) => {
        try {
          const deletedMessage = await prisma.$transaction(async (tx) => {
            await tx.messages.deleteMany({ where: { parentId: messageId } });
            const deletedMessage = await tx.messages.delete({
              where: { id: messageId },
            });
            return deletedMessage;
          });
          io.to(conversationId!).emit(
            "message-deleted",
            messageId,
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
        conversationId,
      }: {
        messageId: string;
        memberId: number;
        reaction: string;
        conversationId: string;
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
                  replies: {
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
                            include: {
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
                    orderBy: {
                      createdAt: "desc",
                    },
                  },
                },
              });
              return updatedMessage;
            });
            io.to(conversationId).emit("reaction-added", updatedMessage);
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
                replies: {
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
                          include: {
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
                  orderBy: {
                    createdAt: "desc",
                  },
                },
              },
            });
            return updatedMessage;
          });

          io.to(conversationId).emit("reaction-added", updatedMessage);
        } catch (error) {
          console.log(error);
          socket.emit("error", new SocketError("Failed to add reaction"));
        }
      }
    );
    socket.on('send-reply',(newReply:Message,conversationId:string)=>{
      
    io.to(conversationId).emit("new-reply",newReply)
    })
    socket.on("disconnect", () => {
      console.log("Client disconnected from channel namespace");
    });
  });
}
