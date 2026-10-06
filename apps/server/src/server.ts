import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { SessionHost } from './session-host.js';

export interface TowerServerHandle {
  httpServer: Server;
  webSocketServer: WebSocketServer;
  host: SessionHost;
  start(port: number): Promise<number>;
  close(): Promise<void>;
}

export function createTowerServer(): TowerServerHandle {
  const httpServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ service: 'tower-race', status: 'ok' }));
  });
  const host = new SessionHost();
  const webSocketServer = new WebSocketServer({ server: httpServer });
  webSocketServer.on('connection', (socket) => host.attach(socket));
  let timer: NodeJS.Timeout | null = null;

  return {
    httpServer,
    webSocketServer,
    host,
    start(port: number): Promise<number> {
      timer = setInterval(() => host.tick(50), 50);
      return new Promise((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        httpServer.once('error', onError);
        httpServer.listen(port, () => {
          httpServer.off('error', onError);
          const address = httpServer.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      });
    },
    close(): Promise<void> {
      if (timer) clearInterval(timer);
      return new Promise((resolve, reject) => {
        webSocketServer.close((webSocketError) => {
          if (webSocketError) {
            reject(webSocketError);
            return;
          }
          httpServer.close((httpError) => httpError ? reject(httpError) : resolve());
        });
      });
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createTowerServer();
  const port = Number(process.env.PORT ?? 8787);
  server.start(port).then((actualPort) => {
    console.log(`Tower Race session server listening on http://localhost:${actualPort}`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
