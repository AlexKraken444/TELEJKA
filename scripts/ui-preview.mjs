// Isolated, in-memory UI preview. Never connects to the deployed backend.
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import {spawn} from 'node:child_process';
const db=await PGlite.create();const socket=new PGLiteSocketServer({db,port:5435,host:'127.0.0.1'});await socket.start();
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3102'],{env:{...process.env,DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:5435/postgres',TELEJKA_DB_POOL_SIZE:'1'},stdio:'inherit',windowsHide:true});
async function stop(){server.kill();await socket.stop();await db.close();process.exit();}process.on('SIGINT',stop);process.on('SIGTERM',stop);
