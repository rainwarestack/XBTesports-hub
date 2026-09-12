import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import reader from '../worker/calendar-public.mjs';
await test('public reader exposes only published records and no write/admin paths',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../worker/calendar-migrations/0001_events.sql',import.meta.url),'utf8'));
  for(const visibility of ['private','public'])db.prepare('INSERT INTO calendar_events (id,data,visibility,start,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(visibility,JSON.stringify({title:visibility,visibility}),visibility,'2026-09-20','2026-09-12','2026-09-12');
  const env={CALENDAR_DB:{prepare:sql=>({all:async()=>({results:db.prepare(sql).all()})})}};
  const request=(path,method='GET')=>new Request('https://public.example'+path,{method});
  const response=await reader.fetch(request('/api/events'),env);
  assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
  assert.deepEqual((await response.json()).events.map(e=>e.title),['public']);
  for(const method of ['POST','PUT','DELETE','PATCH'])assert.equal((await reader.fetch(request('/api/events',method),env)).status,405);
  for(const path of ['/','/api/admin/events','/api/admin/session','/index.html'])assert.equal((await reader.fetch(request(path),env)).status,404);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM calendar_events').get().count,2);db.close();
});
