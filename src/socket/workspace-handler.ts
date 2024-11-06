import { Namespace, Socket } from "socket.io";
import { prisma } from "../index";
import { SocketError } from "../utils/errors";

interface OnlineUser {
  memberId: number;
  userId: number;
}

export function setupWorkspaceHandlers(io: Namespace) {
  const onlineUsers = new Map<string, Set<OnlineUser>>();

  io.on("connection", (socket: Socket) => {
    console.log("Client connected to workspace namespace");

    socket.on("join-workspace", async (workspaceId: string, memberId: number, userId: number) => {
      try {
        const workspace = await prisma.workspaces.findUnique({
          where: { id: workspaceId },
        });

        if (!workspace) {
          throw new SocketError("Workspace not found");
        }

        const member = await prisma.member.findUnique({
          where: {
            userId_workspaceId: {
              userId: userId,
              workspaceId: workspaceId,
            },
          },
        });

        if (!member) {
          throw new SocketError("User is not a member of this workspace");
        }

        socket.join(workspaceId);
        console.log(`User joined workspace: ${workspaceId}`);

        if (!onlineUsers.has(workspaceId)) {
          onlineUsers.set(workspaceId, new Set());
        }
        onlineUsers.get(workspaceId)!.add({ memberId, userId });

        socket.data.currentWorkspace = workspaceId;
        socket.data.currentMember = { memberId, userId };

        io.to(workspaceId).emit("users-online", Array.from(onlineUsers.get(workspaceId)!));
      } catch (error) {
        if (error instanceof SocketError) {
          socket.emit("error", error.message);
        } else {
          socket.emit("error", "An unexpected error occurred");
        }
      }
    });

    socket.on("leave-workspace", (workspaceId: string, memberId: number, userId: number) => {
      removeUserFromWorkspace(socket, workspaceId, memberId, userId);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected from workspace namespace");
      if (socket.data.currentWorkspace && socket.data.currentMember) {
        removeUserFromWorkspace(
          socket,
          socket.data.currentWorkspace,
          socket.data.currentMember.memberId,
          socket.data.currentMember.userId
        );
      }
    });
  });

  function removeUserFromWorkspace(socket: Socket, workspaceId: string, memberId: number, userId: number) {
    socket.leave(workspaceId);
    console.log(`User left workspace: ${workspaceId}`);

    if (onlineUsers.has(workspaceId)) {
      const users = onlineUsers.get(workspaceId)!;
      users.forEach((user) => {
        if (user.memberId === memberId && user.userId === userId) {
          users.delete(user);
        }
      });

      if (users.size === 0) {
        onlineUsers.delete(workspaceId);
      } else {
        io.to(workspaceId).emit("users-online", Array.from(users));
      }
    }

    socket.data.currentWorkspace = null;
    socket.data.currentMember = null;
  }
}