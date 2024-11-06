import { Socket } from 'socket.io';
import { prisma } from '../index';

export async function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    
    const session = await prisma.session.findUnique({
      where: { id: token },
      include: { user: true }
    });

    if (!session || session.expiresAt < new Date()) {
      return next(new Error('Invalid or expired session'));
    }

    
    socket.data.user = session.user;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
}