import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,dateLabel,safeURL,caption,contrast} from '../calendar-admin/cards/model.js';
import worker from '../worker/calendar-api.mjs';
test('card dates stay on the entered day, content is bounded, and Discord captions avoid mass mentions',()=>{
 assert.equal(dateLabel('2026-10-15'),'OCT 15, 2026');assert.equal(dateLabel('2026-02-30'),'DATE TO BE ANNOUNCED');
 assert.equal(normalize({title:'x'.repeat(1000)}).title.length,70);assert.equal(normalize({background:'invalid'}).background,'#f4f3ee');
 assert.equal(safeURL('javascript:alert(1)'),'');assert.equal(safeURL('https://name:secret@example.com'),'');
 const text=caption({title:'Test',notes:'@everyone @here <@123>',url:'https://example.com/register'});assert.ok(text.includes('https://example.com/register'));assert.ok(!text.includes('@everyone'));assert.ok(!text.includes('<@123>'));assert.equal(contrast('#000000','#ffffff'),21);
});
test('event card assets require verified owner access on the Worker',async()=>{
 let assetsRead=false;const env={ACCESS_TEAM_DOMAIN:'https://test.cloudflareaccess.com',ACCESS_AUD:'test',ADMIN_EMAIL:'owner@example.com',ASSETS:{fetch(){assetsRead=true;return new Response('private');}}};
 for(const path of ['/cards','/cards/','/cards/studio.js']){const result=await worker.fetch(new Request('https://calendar.example'+path),env);assert.equal(result.status,401);}assert.equal(assetsRead,false);
});
