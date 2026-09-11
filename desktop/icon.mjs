import sharp from 'sharp';
import {writeFileSync} from 'node:fs';
const sizes=[16,32,48,256];
const images=await Promise.all(sizes.map(size=>sharp('public/telejka-logo.png').resize(size,size).png().toBuffer()));
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length;
images.forEach((image,i)=>{const p=6+i*16;header[p]=sizes[i]===256?0:sizes[i];header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(image.length,p+8);header.writeUInt32LE(offset,p+12);offset+=image.length});
writeFileSync('desktop/telejka.ico',Buffer.concat([header,...images]));
