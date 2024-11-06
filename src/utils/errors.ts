export class SocketError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SocketError';
    }
  }