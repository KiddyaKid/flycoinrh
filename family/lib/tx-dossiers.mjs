// Every swap gets a durable disposition. Measurement capacity never invents a response.
export function dossierStore(db){
 db.exec('CREATE TABLE IF NOT EXISTS dossiers(id TEXT PRIMARY KEY,status TEXT NOT NULL,payload TEXT NOT NULL)');
 db.prepare("UPDATE dossiers SET status='queued' WHERE status='measuring'").run();
 const put=(id,status,payload)=>db.prepare('INSERT INTO dossiers VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload').run(id,status,JSON.stringify(payload));
 return {
  enqueue(trade){if(trade.historical||trade.test||db.prepare('SELECT id FROM dossiers WHERE id=?').get(trade.id))return;const n=db.prepare("SELECT count(*) n FROM dossiers WHERE status IN ('queued','measuring')").get().n;put(trade.id,n<32?'queued':'not-sampled',{trade,reason:n<32?'Awaiting matched measurement':'Measurement capacity reached; no stimulus applied'});},
  next(now=Date.now()){
   for(const row of db.prepare("SELECT * FROM dossiers WHERE status='queued' ORDER BY rowid LIMIT 32").all()){
    const data=JSON.parse(row.payload);if(now-data.trade.timestamp>120000){put(row.id,'not-sampled',{...data,reason:'Queue expired; no stimulus applied'});continue;}
    put(row.id,'measuring',data);return data.trade;
   }return null;
  },
  complete(trade,readout){const {parents,...meta}=readout;put(trade.id,'measured',{trade,measuredAt:readout.asOf,...meta,parents:parents.map(({telemetry,...p})=>p),control:'Same browser image, seed, gain and 40 ms; market input removed'});},
  fail(trade){put(trade.id,'failed',{trade,reason:'Measurement interrupted; no completed response'});},
  get(id){const row=db.prepare('SELECT status,payload FROM dossiers WHERE id=?').get(id);return row?{...JSON.parse(row.payload),status:row.status}:null;},
  recent(){return db.prepare("SELECT payload FROM dossiers WHERE status='measured' ORDER BY rowid DESC LIMIT 8").all().map(r=>({...JSON.parse(r.payload),status:'measured'}));},
  counts(){return Object.fromEntries(db.prepare('SELECT status,count(*) n FROM dossiers GROUP BY status').all().map(r=>[r.status,r.n]));}
 };
}
