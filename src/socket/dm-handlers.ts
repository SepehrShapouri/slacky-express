import { Namespace, Socket } from 'socket.io';
import { prisma } from '../index';
import { SocketError } from '../utils/errors';


export function setupDirectMessageHandlers(io: Namespace) {
  io.on('connection', (socket: Socket) => {
    console.log('Client connected to DM namespace');

    socket.on('join-dm', (dmRoomId: string) => {
      socket.join(dmRoomId);
      console.log(`User joined DM room: ${dmRoomId}`);
    });

    socket.on('send-dm', async (message) => {
      try {
        const savedMessage = await prisma.messages.create({
          data: {
            body: message.body,
            memberId: message.memberId,
            workspaceId: message.workspaceId,
            // For DMs, we don't set channelId
          }
        });

        io.to(message.dmRoomId).emit('new-dm', savedMessage);
      } catch (error) {
        socket.emit('error', new SocketError('Failed to save direct message'));
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected from DM namespace');
    });
  });
}