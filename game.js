(async()=>{
  const source='https://raw.githubusercontent.com/ChipButt/MarbleRace/5f69415b486b2dd373c29a45e66ede7a4b084a90/game.js';
  let s=await (await fetch(source,{cache:'no-store'})).text();

  s=s.replace(
`  function indexAtS(s){`,
`  function forwardTangentAtS(s,span=90){
    const a=pointAtS(clamp(s+8,0,totalLength));
    const b=pointAtS(clamp(s+span,0,totalLength));
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
    return{x:dx/L,y:dy/L};
  }

  function indexAtS(s){`
  );

  s=s.replace(/  function buildCourse\(\)\{[\s\S]*?\n  \}\n\n  function nearestTrack/,
`  function buildCourse(){
    const c=COURSES[selectedCourse];
    buildPath(c.points);
    walls=[];pegs=[];funnels=[];

    c.funnels.forEach((frac,i)=>{
      const fs=totalLength*frac;
      const scale=c.funnelSize||1;
      const outerR=158*scale,holeR=30*scale;
      const entryS=clamp(fs-outerR*.94,80,totalLength-520);
      const exitS=clamp(fs+outerR*.96,entryS+outerR*1.52,totalLength-120);

      const entry=pointAtS(entryS);
      const inT=tangentAtS(entryS,55);
      const nx=-inT.y,ny=inT.x;
      const side=i%2===0?1:-1;
      const offset=(outerR-R-28)*side;
      const bowlX=entry.x-nx*offset;
      const bowlY=entry.y-ny*offset;

      const oldExit=pointAtS(exitS);
      const shiftX=bowlX-oldExit.x;
      const shiftY=bowlY-oldExit.y;
      for(const p of path){
        if(p.s>=exitS){
          p.x+=shiftX;
          p.y+=shiftY;
        }
      }

      funnels.push({
        id:i,s:fs,entryS,exitS,
        x:bowlX,y:bowlY,
        outerR,holeR,side,
        depth:145*scale
      });
    });

    const left=[],right=[];
    for(let i=0;i<path.length;i++){
      const t=tangentAtS(path[i].s,48),nx=-t.y,ny=t.x;
      left.push({x:path[i].x+nx*TRACK_HALF,y:path[i].y+ny*TRACK_HALF,s:path[i].s});
      right.push({x:path[i].x-nx*TRACK_HALF,y:path[i].y-ny*TRACK_HALF,s:path[i].s});
    }
    mesh={left,right};

    for(let i=1;i<path.length;i++){
      walls.push({a:left[i-1],b:left[i],s0:path[i-1].s,s1:path[i].s});
      walls.push({a:right[i-1],b:right[i],s0:path[i-1].s,s1:path[i].s});
    }

    c.pegs.forEach((frac,k)=>{
      const ps=totalLength*frac;
      if(funnels.some(f=>ps>f.entryS-120&&ps<f.exitS+120))return;
      const q=pointAtS(ps),t=tangentAtS(ps,55),nx=-t.y,ny=t.x;
      if(k%2===0){
        const side=k%4===0?1:-1;
        pegs.push({x:q.x+nx*TRACK_HALF*side,y:q.y+ny*TRACK_HALF*side,r:9,s:ps});
        pegs.push({x:q.x-nx*25*side+t.x*80,y:q.y-ny*25*side+t.y*80,r:10,s:ps+80});
      }else pegs.push({x:q.x,y:q.y,r:12,s:ps});
    });

    const xs=path.map(p=>p.x),ys=path.map(p=>p.y);
    funnels.forEach(f=>{
      xs.push(f.x-f.outerR,f.x+f.outerR);
      ys.push(f.y-f.outerR,f.y+f.outerR);
    });
    bounds={
      minX:Math.min(...xs)-160,maxX:Math.max(...xs)+160,
      minY:Math.min(...ys)-160,maxY:Math.max(...ys)+160
    };
  }

  function nearestTrack`
  );

  s=s.replace(/  function enterFunnel\(m,f,near\)\{[\s\S]*?\n  \}/,
`  function enterFunnel(m,f,near){
    let dx=m.x-f.x,dy=m.y-f.y,d=Math.hypot(dx,dy)||1;
    const rim=f.outerR-R-2;

    if(d>rim){
      const k=rim/d;
      m.x=f.x+dx*k;
      m.y=f.y+dy*k;
    }

    m.funnel={id:f.id,f};
    m.progress=f.entryS;
  }`
  );

  s=s.replace(
`      const q=pointAtS(f.exitS),t=tangentAtS(f.exitS,60);
      const speed=Math.max(185,Math.hypot(m.vx,m.vy)*.88);
      // Land on the lower track directly under the drain, then continue toward
      // the normal downstream path.
      m.x=f.x;m.y=f.y;
      m.vx=t.x*speed;m.vy=t.y*speed;
      m.progress=f.exitS;`,
`      const t=forwardTangentAtS(f.exitS,105);
      const speed=Math.max(185,Math.hypot(m.vx,m.vy)*.88);
      m.x=f.x;m.y=f.y;
      m.vx=t.x*speed;m.vy=t.y*speed;
      m.progress=f.exitS;`
  );

  s=s.replace(
`      drawLowerCatchTrack(f);
      drawFunnel(f);`,
`      drawFunnel(f);`
  );

  (0,eval)(s+'\n//# sourceURL=marble-race-runtime.js');
})().catch(err=>{
  console.error(err);
  const o=document.getElementById('overlay');
  if(o){
    o.style.display='flex';
    o.innerHTML='<div class="card"><h2>LOAD ERROR</h2><p>Refresh the page to retry loading the race.</p></div>';
  }
});