(async()=>{
  const source='https://raw.githubusercontent.com/ChipButt/MarbleRace/50774d4/game.js';
  let s=await (await fetch(source,{cache:'no-store'})).text();

  // Remove the oversized inlet/outlet bridge geometry that was covering the bowl.
  s=s.replace(`    funnels.forEach(f=>{\n      if(f.exitS<viewStart||f.entryS>viewEnd)return;\n      drawFunnel(f);\n      drawFunnelConnections(f);\n    });`,`    funnels.forEach(f=>{\n      if(f.exitS<viewStart||f.entryS>viewEnd)return;\n      drawFunnel(f);\n    });`);

  // Let the normal course terminate close to the physical bowl rim on both sides.
  s=s.replace('const entryS=clamp(s-outerR*1.15,80,totalLength-500);','const entryS=clamp(s-outerR*.96,80,totalLength-500);');
  s=s.replace('const exitS=clamp(s+outerR*.95,entryS+outerR*1.45,totalLength-100);','const exitS=clamp(s+outerR*.96,entryS+outerR*1.55,totalLength-100);');

  // Cleaner bowl surface with fewer visible facets.
  s=s.replace('const ringCount=28,steps=72;','const ringCount=20,steps=64;');

  (0,eval)(s+'\n//# sourceURL=marble-race-runtime.js');
})().catch(err=>{
  console.error(err);
  const o=document.getElementById('overlay');
  if(o){o.style.display='flex';o.innerHTML='<div class="card"><h2>LOAD ERROR</h2><p>Refresh the page to retry loading the race.</p></div>';}
});