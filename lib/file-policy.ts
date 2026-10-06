export function validMedicalFile(mime:string,bytes:Uint8Array){
 const starts=(values:number[])=>values.every((v,i)=>bytes[i]===v);
 if(mime==='application/pdf')return starts([37,80,68,70,45]);
 if(mime==='image/jpeg')return starts([255,216,255]);
 if(mime==='image/png')return starts([137,80,78,71,13,10,26,10]);
 if(mime==='image/webp')return starts([82,73,70,70])&&[87,69,66,80].every((v,i)=>bytes[i+8]===v);
 return false;
}
