import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { attachMatSync } from './ws/matSync.js';

const port = Number(process.env.PORT) || 3001;
const app = createApp();
const server = http.createServer(app);
attachMatSync(server);

server.listen(port, () => {
  console.log(`BJJ RollMaster API listening on port ${port}`);
});
