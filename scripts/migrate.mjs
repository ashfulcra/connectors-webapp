import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import {createStore} from '../src/lib/server/store.js';
const values={...parseEnv(await readFile('.env','utf8')),...process.env};
if(!values.DATABASE_URL || !values.CONNECTORS_DEPLOYMENT_ID || !values.OWNER_USER_ID)throw new Error('Configure DATABASE_URL, CONNECTORS_DEPLOYMENT_ID and OWNER_USER_ID securely first');
const pool=new Pool({connectionString:values.DATABASE_URL});
try{await pool.query(await readFile('migrations/001-operational.sql','utf8'));await createStore({pool,deploymentId:values.CONNECTORS_DEPLOYMENT_ID,ownerId:values.OWNER_USER_ID}).initialize();console.log('Operational migration applied and owner binding verified');}finally{await pool.end();}
