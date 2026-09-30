import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
export function sourceChecksum(root='.') {
  const excluded=new Set(['.git','node_modules','var','tmp','coverage','test-results','playwright-report','.env','MANIFEST.sha256']);
  const walk=(dir,relative='')=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const path=relative?relative+'/'+e.name:e.name;
    if(excluded.has(e.name) || path==='docs/submission.json' || e.name.endsWith('.zip') || e.name.startsWith('.env.') && e.name!=='.env.example')return [];
    return e.isDirectory()?walk(join(dir,e.name),path):e.isFile()?[path]:[];
  });
  const hash=createHash('sha256');
  for(const path of walk(root).sort()) {
    const bytes=readFileSync(join(root,path));hash.update(path+'\0'+bytes.length+'\0');hash.update(bytes);
  }
  return hash.digest('hex');
}
