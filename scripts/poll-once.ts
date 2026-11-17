import 'dotenv/config';
import { pool } from '../src/db.js';
import { pollDeposits } from '../src/poll.js';
await pollDeposits();
await pool.end();