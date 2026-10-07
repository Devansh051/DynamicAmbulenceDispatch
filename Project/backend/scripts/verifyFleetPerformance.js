import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import env from '../src/config/env.js';
assert(env.nodeEnv !== 'production' && /^[A-Za-z][A-Za-z0-9_]*_Test$/.test(env.db.database));
const suffix=crypto.randomUUID().slice(0,8);
env.fleet.redisPrefix='ems:performance:'+suffix;
env.fleet.simulatorEnabled=true;
env.fleet.persistenceSampleMs=30000;
env.fleet.socketBroadcastIntervalMs=1000;
const {default:db}=await import('../src/config/database.js');
const {default:store}=await import('../src/modules/fleet/fleetState.store.js');
const {default:tracker}=await import('../src/modules/fleet/fleetTracker.service.js');
const {default:Worker}=await import('../src/modules/fleet/fleetPersistence.worker.js');
const {default:Ambulance}=await import('../src/modules/ambulances/ambulance.model.js');
const {default:Hospital}=await import('../src/modules/hospitals/hospital.model.js');
const {default:User}=await import('../src/modules/users/user.model.js');
const {default:session}=await import('../src/modules/auth/session.service.js');
const {attachFleetSocketServer,closeFleetSocketServer}=await import('../src/modules/fleet/fleet.socket.js');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket,server, worker;
try {
 assert(await store.init());
 const hospital=await Hospital.findOne({where:{is_active:true}});
 const vehicles=[];
 for(let i=0;i<25;i++) vehicles.push(await Ambulance.create({fleet_code:`PERF-${suffix}-${i}`,CurrentHospitalID:hospital.HospitalID,Status:'available',Fuel:100,is_active:true,is_simulated:true,vehicle_type:'ADVANCED_LIFE_SUPPORT'}));
 const user=await User.create({email:`performance-${suffix}@ems.test`,name:'Synthetic performance',role:'ADMIN',status:'ACTIVE',password_hash:'unused'});
 const principal={kind:'simulator',sourceId:'performance'};
 let seq=0;
 const packet=(vehicle,round)=>({ambulance_id:vehicle.AmbulanceID,latitude:12.97+round*0.00001,longitude:77.59,gps_timestamp:new Date().toISOString(),event_id:`perf-${suffix}-${++seq}`,is_simulated:true});
 for(const vehicle of vehicles) await tracker.ingest(packet(vehicle,0),principal);
 server=createServer();attachFleetSocketServer(server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {io}=createRequire(new URL('../../frontend/package.json',import.meta.url))('socket.io-client');
 socket=io('http://127.0.0.1:'+server.address().port,{autoConnect:false,auth:{token:session.createSessionToken(user).token}});
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Snapshot timeout')),10000);socket.once('fleet:snapshot',()=>{clearTimeout(t);resolve();});socket.connect();});
 let updates=0;socket.on('fleet:update',()=>updates++);
 let sqlQueries=0;const originalQuery=db.query.bind(db);db.query=(...args)=>{sqlQueries++;return originalQuery(...args);};
 const latencies=[];const started=performance.now();
 for(let round=1;round<=4;round++) for(const vehicle of vehicles) {const at=performance.now();assert((await tracker.ingest(packet(vehicle,round),principal)).accepted);latencies.push(performance.now()-at);}
 const burstMs=performance.now()-started,burstSqlQueries=sqlQueries;
 await wait(1200);
 const snapshotTimes=[];let mgets=0;const originalMget=store.client.mGet.bind(store.client);store.client.mGet=(...args)=>{mgets++;return originalMget(...args);};
 for(let i=0;i<20;i++){const at=performance.now();assert.equal((await tracker.getLiveStates(vehicles.map(v=>v.AmbulanceID))).size,25);snapshotTimes.push(performance.now()-at);}
 const queue=await store.getPersistenceQueueDepth();assert.equal(queue.total,25);
 sqlQueries=0;worker=new Worker();assert.equal(await worker.drainOnce(),25);const batchQueries=sqlQueries;
 const [history]=await db.query('SELECT COUNT(*) AS rows FROM dbo.AmbulanceLocationHistory WHERE ambulance_id IN (:ids)',{replacements:{ids:vehicles.map(v=>v.AmbulanceID)}});assert.equal(history[0].rows,25);
 const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {p50_ms:sorted[Math.floor(sorted.length*.5)],p95_ms:sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]};};
 console.log(JSON.stringify({verified:true,conditions:{vehicles:25,telemetry_events:125,measured_burst_events:100,persistence_sample_ms:30000,batch_size:100,socket_interval_ms:1000},burst_ms:burstMs,ingest:stats(latencies),warm_burst_sql_queries:burstSqlQueries,received_update_events:updates,snapshot:stats(snapshotTimes),snapshots:20,redis_mget_calls:mgets,queue_before_drain:queue.total,sql_batch_queries_including_transaction:batchQueries,persisted_locations:history[0].rows},null,2));
} catch(error){console.error(error.message);process.exitCode=1;}
finally {await worker?.stop({drain:true});socket?.disconnect();await closeFleetSocketServer();if(server?.listening)await new Promise(resolve=>server.close(resolve));await store.close();await db.close();}
