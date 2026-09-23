(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.piFeeMeterBridgeV1917=api;
})(typeof window!=='undefined' ? window : globalThis,function(){
  const COMPONENTS=Object.freeze({
    electricity:{name:'Energia elektryczna',unit:'kwh',column:'electricity_reading'},
    water:{name:'Woda i kanalizacja',unit:'m3',column:'water_reading'},
    gas:{name:'Gaz',unit:'m3',column:'gas_reading'}
  });

  const blank=value=>value===null || value===undefined || String(value).trim()==='';
  const number=value=>{
    if(blank(value)) return null;
    const parsed=Number(String(value).replace(/\s/g,'').replace(',','.'));
    return Number.isFinite(parsed) && parsed>=0 ? parsed : null;
  };
  const round3=value=>Math.round((Number(value)+Number.EPSILON)*1000)/1000;
  const text=value=>String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function componentOf(value){
    const hard=String(value?.component || value?.meter_type || '').toLowerCase();
    if(['electricity','power','energy'].includes(hard)) return 'electricity';
    if(['water'].includes(hard)) return 'water';
    if(['gas'].includes(hard)) return 'gas';
    const source=text(typeof value==='string' ? value : (value?.name || value?.label || ''));
    if(/prad|energia|electric|kwh|enea|energa|tauron|pge/.test(source)) return 'electricity';
    if(/woda|wodoci|kanaliz|sciek|water/.test(source)) return 'water';
    if(/gaz|pgnig|gas/.test(source)) return 'gas';
    return '';
  }
  function readingDate(row){
    const raw=String(row?.reading_date || row?.created_at || '').slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }
  function readingValue(row,component){
    const meta=COMPONENTS[component];
    if(!meta) return null;
    const direct=number(row?.[meta.column]);
    if(direct!==null) return direct;
    return componentOf(row)===component ? number(row?.reading_value) : null;
  }
  function monthBounds(month){
    if(!/^\d{4}-\d{2}$/.test(String(month || ''))) return null;
    const [year,monthNumber]=String(month).split('-').map(Number);
    const nextMonth=new Date(Date.UTC(year,monthNumber,1)).toISOString().slice(0,10);
    return {start:`${month}-01`,next:nextMonth};
  }
  function compareReadings(a,b){
    const date=readingDate(a).localeCompare(readingDate(b));
    if(date) return date;
    return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
  }
  function suggestions(readings,month){
    const bounds=monthBounds(month);
    if(!bounds) return {};
    const rows=(Array.isArray(readings)?readings:[]).filter(row=>readingDate(row)).slice().sort(compareReadings);
    const result={};
    for(const [component,meta] of Object.entries(COMPONENTS)){
      const usable=rows.filter(row=>readingValue(row,component)!==null);
      const before=usable.filter(row=>readingDate(row)<bounds.start).at(-1) || null;
      const during=usable.filter(row=>readingDate(row)>=bounds.start && readingDate(row)<bounds.next);
      const endRow=during.at(-1) || null;
      if(!endRow) continue;
      let startRow=before;
      if(!startRow && during.length>1) startRow=during[0];
      if(startRow===endRow) startRow=null;
      const startValue=startRow ? readingValue(startRow,component) : null;
      const endValue=readingValue(endRow,component);
      result[component]={
        component,
        name:meta.name,
        unit:meta.unit,
        period_from:startRow ? readingDate(startRow) : bounds.start,
        period_to:readingDate(endRow),
        start_reading:startValue,
        end_reading:endValue,
        consumption:startValue!==null && endValue>=startValue ? round3(endValue-startValue) : 0,
        meter_source:{
          source:'tenant_meter_readings',
          start_id:startRow?.id || null,
          start_date:startRow ? readingDate(startRow) : null,
          end_id:endRow?.id || null,
          end_date:readingDate(endRow)
        }
      };
    }
    return result;
  }
  function mergeMediaItems(mediaItems,readings,month){
    const proposed=suggestions(readings,month);
    const items=(Array.isArray(mediaItems)?mediaItems:[]).map(item=>({...item,meter_source:item?.meter_source && typeof item.meter_source==='object' ? {...item.meter_source}:null}));
    let added=0,updated=0,readingFields=0;
    for(const [component,suggestion] of Object.entries(proposed)){
      let item=items.find(row=>componentOf(row)===component);
      if(!item){
        item={id:`meter-${component}-${month}`,name:suggestion.name,component,unit:suggestion.unit,unit_price:0,advances:0,sort_order:items.length};
        items.push(item);
        added+=1;
      }
      let changed=false,meterChanged=false;
      if(!item.component){ item.component=component; changed=true; }
      if(blank(item.name)){ item.name=suggestion.name; changed=true; }
      if(blank(item.unit)){ item.unit=suggestion.unit; changed=true; }
      for(const field of ['period_from','period_to']){
        if(blank(item[field]) && !blank(suggestion[field])){ item[field]=suggestion[field]; changed=true; }
      }
      for(const field of ['start_reading','end_reading']){
        if(blank(item[field]) && suggestion[field]!==null){ item[field]=suggestion[field]; changed=true;meterChanged=true;readingFields+=1; }
      }
      const start=number(item.start_reading),end=number(item.end_reading);
      if(start!==null && end!==null && end>=start){ item.consumption=round3(end-start); changed=true; }
      if(meterChanged) item.meter_source={...suggestion.meter_source};
      if(changed && !meterChanged && !item.meter_source && suggestion.meter_source) item.meter_source={...suggestion.meter_source};
      if(changed) updated+=1;
    }
    return {items,suggestions:proposed,available:Object.keys(proposed).length,added,updated,readingFields};
  }

  return {COMPONENTS,componentOf,readingDate,readingValue,monthBounds,suggestions,mergeMediaItems};
});
