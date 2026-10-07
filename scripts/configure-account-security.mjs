// One-time setup. Never prints or writes the encryption key to a local file.
// Do not rotate this key without re-encrypting existing authenticator secrets.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const configs=['worker/social.wrangler.toml','worker/calendar.wrangler.toml'];
const cli=['node_modules/wrangler/bin/wrangler.js'];
const options={encoding:'utf8',stdio:['pipe','pipe','pipe'],env:{...process.env,WRANGLER_LOG_PATH:'.wrangler/wrangler.log'}};
for(const config of configs){const list=JSON.parse(execFileSync(process.execPath,[...cli,'secret','list','--config',config],options));if(list.some(item=>item.name==='ACCOUNT_SECURITY_KEY'))throw Error('An encryption key already exists. Keep it; do not rotate it with this setup script.');}
const key=randomBytes(32).toString('hex');
for(const config of configs){
 let saved=false;
 for(let attempt=0;attempt<3&&!saved;attempt++)try{execFileSync(process.execPath,[...cli,'secret','put','ACCOUNT_SECURITY_KEY','--config',config],{...options,input:key+'\n'});saved=true;}catch{if(attempt===2)throw Error('Encryption key setup did not finish for '+config+'. Do not enable account security until both Workers have the same key.');}
 console.log('Account security encryption configured for '+config);
}
