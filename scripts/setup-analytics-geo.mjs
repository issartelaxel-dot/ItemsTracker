import {createGeoLookup} from '../server/analytics-geo.mjs'
import {rename,rm} from 'node:fs/promises'
import {resolve} from 'node:path'
const path=process.env.GEOIP_DATABASE_PATH||resolve('server/data/dbip-city-lite.mmdb'),backup=path+'.previous'
let saved=false
if(process.argv.includes('--refresh')){try{await rename(path,backup);saved=true}catch(e){if(e.code!=='ENOENT')throw e}}
const geo=createGeoLookup({path,download:true});await geo.start();const status=geo.status()
if(!status.ready){if(saved)await rename(backup,path);throw new Error(status.error||'Base géographique indisponible.')}
if(saved)await rm(backup,{force:true})
console.log('DB-IP Lite prête. Redémarrer le serveur après une actualisation de la base.')
