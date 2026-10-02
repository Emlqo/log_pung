import {readFile} from 'node:fs/promises';
import {publicKey,extensionId} from './distribution-lib.mjs';
if(!process.argv[2])throw Error('담당자가 보관한 실제 서명 PEM 경로 필요');
const pub=publicKey(await readFile(process.argv[2],'utf8'));
console.log(JSON.stringify({extensionId:extensionId(pub),publicKeyBase64:pub.toString('base64'),privateKeyIncluded:false,externalHostingVerified:false,policyInstallVerified:false},null,2));
