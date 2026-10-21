const fs=require('fs'),path=require('path');
const P=process.argv[2], W=process.argv[3];
const Core=require(path.join(P,'assets/core.js'));
const ids=JSON.parse(fs.readFileSync(P+'/data/seasons.json')).seasons;
const raw={seasons:ids.map(i=>JSON.parse(fs.readFileSync(`${P}/data/seasons/${i}.json`))),teams:JSON.parse(fs.readFileSync(P+'/data/teams.json')),players:JSON.parse(fs.readFileSync(P+'/data/players.json'))};
const db=Core.build(raw);
const pub=JSON.parse(fs.readFileSync(W+'/published_tables.json'));
let ok=0,bad=0,nomatch=0,orderDiff=0; const report=[];
for(const T of pub){
  const names=new Set(T.rows.map(r=>r.team));
  // find tournament+div whose team names set equals
  let found=null;
  for(const t of db.tournaments){ if(t.final) continue;
    const divs=t.divisions.length?t.divisions:[null];
    for(const d of divs){
      const ms=t.matches.filter(m=>(t.format==='league'||Core.isRoundStage(m.stage))&&(m.div||null)===d);
      const tn=new Set(); ms.forEach(m=>{tn.add(m.homeName);tn.add(m.awayName)});
      if(tn.size===names.size&&[...names].every(n=>tn.has(n))){
        const upto=ms.filter(m=>m.date<=T.date);
        if(!upto.length) continue;
        const rows=Core.standings(upto);
        // played count must match roughly
        const sumP=T.rows.reduce((s,r)=>s+r.p,0), sumC=rows.reduce((s,r)=>s+r.p,0);
        if(!found||Math.abs(sumP-sumC)<found.diff) found={t,d,rows,diff:Math.abs(sumP-sumC)};
      }
    }
  }
  if(!found){nomatch++; report.push('NOMATCH '+T.date+' '+T.title+' | '+[...names].join(', ')); continue;}
  const byName=new Map(found.rows.map(r=>[r.name,r]));
  const diffs=[];
  for(const r of T.rows){const c=byName.get(r.team); if(!c){diffs.push(r.team+' ?');continue;}
    if(c.p!==r.p||c.gf!==r.gf||c.ga!==r.ga||c.pts!==r.pts) diffs.push(`${r.team}: опубл ${r.p} ${r.gf}-${r.ga} ${r.pts} / расчёт ${c.p} ${c.gf}-${c.ga} ${c.pts}`);}
  const ord=T.rows.map(r=>r.team).join('|')===found.rows.map(r=>r.name).join('|');
  if(diffs.length){bad++; report.push(`DIFF ${T.date} ${T.title} [${found.t.key} ${found.d||''}]\n   `+diffs.join('\n   '));}
  else { ok++; if(!ord){orderDiff++; report.push(`ORDER ${T.date} ${found.t.key} ${found.d||''}\n   опубл: ${T.rows.map(r=>r.team+' '+r.pts).join(', ')}\n   расчёт: ${found.rows.map(r=>r.name+' '+r.pts).join(', ')}`);} }
}
console.log({tables:pub.length,ok,bad,nomatch,orderDiff});
fs.writeFileSync(W+'/validate_report.txt',report.join('\n'));
