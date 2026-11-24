import { pool } from '../src/db.js';
const { rows } = await pool.query(
  `select table_name, column_name, data_type
     from information_schema.columns
    where table_name in ('postings','transactions')
    order by table_name, ordinal_position`,
);
for (const r of rows) console.log(r.table_name + '.' + r.column_name + '  ' + r.data_type);
await pool.end();