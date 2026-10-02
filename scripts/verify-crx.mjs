import {readFile} from 'node:fs/promises';
import {inspectCrx3} from './distribution-lib.mjs';
if(!process.argv[2])throw Error('검사할 CRX 경로 필요');
const result=inspectCrx3(await readFile(process.argv[2]),process.argv.includes('--student')?'student':'diagnostic');
console.log(JSON.stringify({extensionId:result.id,version:result.manifest.version,updateUrl:result.manifest.update_url,sha256:result.sha256,signatureVerified:true,chromePolicyInstallationVerified:false},null,2));
