// Browser checks for visible text; excludes native popup menus and disabled controls.
module.exports = async function auditText(page) {
  return page.evaluate(() => {
    const issues=[];
    const rgba=value=>{
      if(value==='transparent')return [0,0,0,0];
      const n=(value.match(/[\d.]+/g)||[]).map(Number);
      if(value.startsWith('color(srgb'))return [n[0]*255,n[1]*255,n[2]*255,n[3]??1];
      return [n[0]||0,n[1]||0,n[2]||0,n[3]??1];
    };
    const over=(fg,bg)=>[0,1,2].map(i=>fg[i]*fg[3]+bg[i]*(1-fg[3]));
    const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    const roots=[...document.querySelectorAll('#page-header,#page-content,.modal,.floating-tooltip,.site-footer')];
    const elements=new Set(roots.flatMap(root=>[root,...root.querySelectorAll('*')]));
    for(const el of elements){
      if(['OPTION','SVG','PATH'].includes(el.tagName)||el.closest('svg,[hidden],.sr-only,:disabled'))continue;
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      if(!r.width||!r.height||s.visibility==='hidden'||s.display==='none')continue;
      const text=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(Boolean).join(' ') || (el.tagName==='SELECT'?el.selectedOptions[0]?.textContent:'') || (el.matches('input,textarea')?(el.value||el.placeholder):'');
      if(!text)continue;
      const label=(el.id?'#'+el.id:el.className||el.tagName)+': '+text.slice(0,75);
      if(parseFloat(s.fontSize)<11.9)issues.push({type:'small',label,size:s.fontSize});
      let bg=[255,255,255],ancestors=[],node=el;
      while(node){ancestors.unshift(node);node=node.parentElement;}
      for(const node of ancestors)bg=over(rgba(getComputedStyle(node).backgroundColor),bg);
      const color=el.matches('input,textarea')&&!el.value?getComputedStyle(el,'::placeholder').color:s.color;
      const fg=over(rgba(color),bg),a=luminance(fg),b=luminance(bg),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700);
      if(contrast<(large?3:4.5)-.02)issues.push({type:'contrast',label,ratio:+contrast.toFixed(2),color,bg});
      if(['hidden','clip'].includes(s.overflowY)&&el.scrollHeight>el.clientHeight+1)issues.push({type:'vertical-clip',label});
      if(['hidden','clip'].includes(s.overflowX)&&el.scrollWidth>el.clientWidth+1)issues.push({type:'horizontal-clip',label});
    }
    return issues;
  });
};
