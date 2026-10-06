// Small, dependency-free OpenXML writer. All user strings use inlineStr, never formulas.
const xml=(v:unknown)=>String(v??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const utf8=new TextEncoder();
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function column(index:number){let result='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
function zip(entries:Record<string,string>){let offset=0;const parts:Uint8Array[]=[],central:Uint8Array[]=[];for(const [path,content] of Object.entries(entries)){
 const name=utf8.encode(path),bytes=utf8.encode(content),crc=crc32(bytes),header=new Uint8Array(30+name.length),view=new DataView(header.buffer);view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x0800,true);view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);header.set(name,30);parts.push(header,bytes);
 const dir=new Uint8Array(46+name.length),dv=new DataView(dir.buffer);dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0x0800,true);dv.setUint32(16,crc,true);dv.setUint32(20,bytes.length,true);dv.setUint32(24,bytes.length,true);dv.setUint16(28,name.length,true);dv.setUint32(42,offset,true);dir.set(name,46);central.push(dir);offset+=header.length+bytes.length;
 }
 const size=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),dv=new DataView(end.buffer);dv.setUint32(0,0x06054b50,true);dv.setUint16(8,central.length,true);dv.setUint16(10,central.length,true);dv.setUint32(12,size,true);dv.setUint32(16,offset,true);const all=[...parts,...central,end],out=new Uint8Array(all.reduce((n,b)=>n+b.length,0));let cursor=0;for(const b of all){out.set(b,cursor);cursor+=b.length;}return out;
}
export function workbook(headers:string[],rows:unknown[][],rtl=false){
 const cells=[headers,...rows].map((row,r)=>'<row r="'+(r+1)+'">'+row.map((v,c)=>'<c r="'+column(c)+(r+1)+'" '+(typeof v==='number'&&Number.isFinite(v)?'t="n"><v>'+v+'</v>':'t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is>')+'</c>').join('')+'</row>').join('');
 return zip({
 '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clinic" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="'+(rtl?'1':'0')+'"/></sheetViews><sheetData>'+cells+'</sheetData></worksheet>'
 });
}
