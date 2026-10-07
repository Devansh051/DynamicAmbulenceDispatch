import axios from 'axios';
import env from '../src/config/env.js';
import maps from '../src/modules/hospitals/googleMaps.service.js';
import directory from '../src/modules/hospitals/dataGov.service.js';
const checks = [];
async function probe(name, operation, summarize) {
  try { const response = await operation(); checks.push({name, http:response.status, ...summarize(response.data)}); }
  catch (error) { checks.push({name, http:error.response?.status || null, status:'BLOCKED', reason:directory.sanitizeError(maps.sanitizeError(error))}); }
}
await probe('Data.gov.in hospital directory', () => axios.get(env.dataGov.baseUrl.replace(/\/$/,'')+'/'+env.dataGov.resourceId, {params:{'api-key':env.dataGov.apiKey,format:'json',limit:1}, timeout:15000}), data => ({status:Array.isArray(data.records) && data.records.length ? 'VERIFIED':'BLOCKED', records:data.records?.length || 0, message: data.message || data.error || null}));
const headers = {'X-Goog-Api-Key':env.googleMaps.apiKey,'Content-Type':'application/json'};
await probe('Google Places', () => axios.post(maps.placesUrl, {includedTypes:['hospital'],maxResultCount:1,locationRestriction:{circle:{center:{latitude:12.97,longitude:77.59},radius:500}}}, {headers:{...headers,'X-Goog-FieldMask':'places.id'},timeout:15000}), data=>({status:'VERIFIED',places:data.places?.length || 0}));
await probe('Google Routes', () => axios.post(maps.routesUrl, {origin:{location:{latLng:{latitude:12.97,longitude:77.59}}},destination:{location:{latLng:{latitude:12.98,longitude:77.6}}},travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE'}, {headers:{...headers,'X-Goog-FieldMask':'routes.duration,routes.distanceMeters'},timeout:15000}), data=>({status:data.routes?.length?'VERIFIED':'BLOCKED', routes:data.routes?.length || 0}));
console.log(JSON.stringify({checks},null,2));
