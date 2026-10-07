import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import env from '../src/config/env.js';
const base=new URL(process.env.DEMO_API_URL || 'http://localhost:5005/api/v1/');
assert(env.nodeEnv!=='production' && /^[A-Za-z][A-Za-z0-9_]*_Test$/.test(env.db.database));
assert(base.protocol==='http:' && ['localhost','127.0.0.1'].includes(base.hostname));
let token;
async function api(path,method='GET',body){const response=await fetch(base.href.replace(/\/$/,'')+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();if(!response.ok)throw new Error(value.error?.message||response.status);return value.data;}
try {
 token=(await api('/auth/login','POST',{email:process.env.DEMO_ADMIN_EMAIL||'fleet-demo@ems.test',password:process.env.DEMO_ADMIN_PASSWORD})).token;
 assert.equal((await api('/health/details')).database.database,env.db.database);
 const action=process.argv[2];
 if(action==='assign') {
  const incident=await api('/emergencies','POST',{location_address:'Synthetic browser verification',latitude:12.974,longitude:77.593,emergency_type:'CARDIAC',severity:5,is_simulated:true});
  await api(`/emergencies/${incident.id}/status`,'PATCH',{status:'VERIFIED'});
  const recommendation=await api(`/emergencies/${incident.id}/recommendations`,'POST',{});
  const top=recommendation.candidates[0];assert(top && top.is_live_gps && top.is_simulated!==false);
  const vehicle=await api('/ambulances/'+top.ambulance_id);
  const assigned=await api(`/emergencies/${incident.id}/assign`,'POST',{ambulance_id:top.ambulance_id,hospital_id:vehicle.CurrentHospitalID,recommendation_id:recommendation.recommendation_id});
  await api(`/emergencies/${incident.id}/status`,'PATCH',{status:'EN_ROUTE'});
  const result={incident_id:assigned.id,ambulance_id:assigned.assigned_ambulance_id,status:'EN_ROUTE',recommendation_id:recommendation.recommendation_id,is_live_gps:top.is_live_gps};
  await fs.writeFile(new URL('../browser-assignment.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 } else if(action==='cancel') {
  const id=Number(process.argv[3]);const incident=await api('/emergencies/'+id);assert(incident.is_simulated);
  console.log(JSON.stringify({id,status:(await api(`/emergencies/${id}/status`,'PATCH',{status:'CANCELLED',notes:'Synthetic verification complete.'})).status}));
 } else if(action==='stop') console.log(JSON.stringify(await api('/fleet/simulator/stop','POST',{})));
 else throw new Error('Use assign, cancel <id>, or stop.');
} catch(error){console.error(error.message);process.exitCode=1;}
